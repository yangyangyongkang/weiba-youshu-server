const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter, User } = require("./db");

const logger = morgan("tiny");
const app = express();
const WX_APPID = process.env.WX_APPID;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 更新计数
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

// 获取计数
app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
});

// 小程序登录：云托管会注入微信身份请求头
app.get("/api/auth/me", async (req, res) => {
  try {
    if (!WX_APPID) {
      console.error("缺少 WX_APPID 环境变量");
      return res.status(500).json({ message: "服务配置不完整" });
    }

    const source = req.headers["x-wx-source"];
    const openid = req.headers["x-wx-openid"];
    const appid = req.headers["x-wx-appid"];

    if (!source || !openid || appid !== WX_APPID) {
      return res.status(401).json({ message: "未识别到微信身份" });
    }

    const [user] = await User.findOrCreate({
      where: { appid, openid },
      defaults: { appid, openid, lastSeenAt: new Date() },
    });

    await user.update({ lastSeenAt: new Date() });

    return res.json({
      loggedIn: true,
      user: {
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("微信身份处理失败", error.message);
    return res.status(500).json({ message: "登录服务暂时不可用" });
  }
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap().catch((error) => {
  console.error("服务启动失败", error.message);
  process.exitCode = 1;
});
