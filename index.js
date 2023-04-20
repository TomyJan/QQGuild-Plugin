import Plugin from "../../lib/plugins/plugin.js"
import Bott from "./lib/Bott.js"
import yaml from "yaml"
import fs from "node:fs"
import path from "node:path"

export class QQGuild extends Plugin {
    constructor() {
        super({
            name: "QQ频道插件",
            priority: -99999999999999999,
            rule: [
                {
                    reg: "^#频道插件\\.",
                    fnc: "控制台",
                    permission: "master"
                }
            ]
        })
    }

    async 控制台(e) {
        if (e.message_type !== "private") {
            return
        }

        if (e.sub_type !== "friend") {
            return
        }

        if (global.__QQGuild__ !== true) {
            e.reply("出现未知错误！")
            logger.warn("警告！警告！警告！出现未知错误！")
            return
        }

        let cmd = e.msg.replace(/\s+/g, " ").trim().split(" ")

        switch (cmd.shift()) {
            case "#频道插件.机器人.添加":
                e.reply(addBott(cmd))
                break
            case "#频道插件.机器人.删除":
                e.reply(delBott(parseInt(cmd[0]), cmd[0] === "全部"))
                break
            case "#频道插件.机器人.启动":
                e.reply(startBott(parseInt(cmd[0]), cmd[0] === "全部"))
                break
            case "#频道插件.机器人.停止":
                e.reply(stopBott(parseInt(cmd[0]), cmd[0] === "全部"))
                break
            case "#频道插件.机器人.重连":
                reStartBott(parseInt(cmd[0]), cmd[0] === "全部")
                e.reply("正在重连...")
                break
            case "#频道插件.机器人.状态":
                e.reply(getBottState(parseInt(cmd[0])))
                break
            case "#频道插件.机器人.列表":
                e.reply(getBottStateList())
                break
            case "#频道插件.机器人.设置":
                e.reply(setBott(parseInt(cmd.shift()), cmd.shift(), cmd))
                break
            default:
                e.reply("暂不支持此命令.")
        }
    }
}

function saveConfig(cfgPath, config) {
    fs.writeFileSync(cfgPath, yaml.stringify(config), "UTF-8")
}

function addBott(config) {
    if (!/^1\d{8}$/.test(config[0])) {
        return "APPID 不正确！"
    }
    if (!/^[0-9a-zA-Z]{32}$/.test(config[1])) {
        return "TOKEN 不正确！"
    }
    let cfg = {
        appId: config[0],
        token: config[1],
        sandBox: config[2] === "true",
        allMsg: config[3] === "true",
        autoStart: config[4] === "true"
    }
    let cfgPath = path.join(global.Bott.cfgDir, `${cfg.appId}.yaml`)
    saveConfig(cfgPath, cfg)
    cfg.file = cfgPath
    global.Bott.set(global.Bott.size + 1, new Bott(cfg))
    return "已添加."
}

function delBott(index, isAll) {
    if (isAll) {
        global.Bott.forEach((bott) => {
            bott.stop()
            fs.rmSync(bott.configFile)
        })
        global.Bott.clear()
    } else {
        let bott = global.Bott.get(index)
        if (!bott) {
            return "标号无效！"
        }
        bott.stop()
        fs.rmSync(bott.configFile)
        global.Bott.delete(index)
    }
    return "已删除."
}

function startBott(index, isAll) {
    if (isAll) {
        global.Bott.forEach((bott) => bott.start())
    } else {
        let bott = global.Bott.get(index)
        if (!bott) {
            return "标号无效！"
        }
        bott.start()
    }
    return "正在启动..."
}

function stopBott(index, isAll) {
    if (isAll) {
        global.Bott.forEach((bott) => bott.stop())
    } else {
        let bott = global.Bott.get(index)
        if (!bott) {
            return "标号无效！"
        }
        bott.stop()
    }
    return "正在停止..."
}

async function reStartBott(index, isAll) {
    stopBott(index, isAll)
    await new Promise((r) => setTimeout(r, 3000))
    startBott(index, isAll)
}

function getBottState(index) {
    let bott = global.Bott.get(index)
    if (!bott) {
        return "标号无效！"
    }
    return [
        "#频道插件.机器人.状态",
        `- 标号 => ${index}`,
        `：${bott.name}`,
        `：${bott.state}`
    ].join("\n")
}

function getBottStateList() {
    let text = "#频道插件.机器人.列表"
    if (global.Bott.size < 1) {
        text += "\n- 无"
    } else {
        global.Bott.forEach((bott, index) => {
            text += [
                `\n- 标号 => ${index}`,
                `：${bott.name}`,
                `：${bott.state}`
            ].join("\n")
        })
    }
    return text
}

function setBott(index, cmd, args) {
    let bott = global.Bott.get(index)
    if (!bott) {
        return "标号无效！"
    }

    let save = () => {
        saveConfig(bott.configFile, bott)
    }

    switch (cmd) {
        case "查看":
            return [
                "#频道插件.机器人.设置 查看",
                `- APPID：${bott.appId}`,
                `- TOKEN：${bott.token}`,
                `- 沙盒测试：${bott.sandBox === true ? "已开启" : "已关闭"}`,
                `- 全部消息：${bott.allMsg === true ? "已开启" : "已关闭"}`,
                `- 直接启动：${bott.autoStart === true ? "已开启" : "已关闭"}`
            ].join("\n")
        case "沙盒测试":
            switch (args[0]) {
                case "开启":
                    bott.sandBox = true
                    break
                case "关闭":
                    bott.sandBox = false
                    break
                default:
                    return "开启/关闭？"
            }
            save()
            return "已设置. 重连生效."
        case "全部消息":
            switch (args[0]) {
                case "开启":
                    bott.allMsg = true
                    break
                case "关闭":
                    bott.allMsg = false
                    break
                default:
                    return "开启/关闭？"
            }
            save()
            return "已设置. 重连生效.\n注意！！公域机器人必须设置为关闭."
        case "直接启动":
            switch (args[0]) {
                case "开启":
                    bott.autoStart = true
                    break
                case "关闭":
                    bott.autoStart = false
                    break
                default:
                    return "开启/关闭？"
            }
            save()
            return "已设置. 重启生效."
        default:
            return "暂不支持此设置."
    }

    return "已设置."
}

if (global.__QQGuild__ === undefined) {
    global.__QQGuild__ = false

    let { name, version, author } = JSON.parse(
        fs.readFileSync("./plugins/QQGuild-Plugin/package.json")
    )

    logger.info(`------------------------`)
    logger.info(`- 欢迎使用QQ频道插件(${name}) v${version}`)
    logger.info(`- 本插件作者：${author}`)
    logger.info(`- 正在初始化... ^_^`)

    global.Bott = new Map()
    global.Bott.cfgDir = "./plugins/QQGuild-Plugin/config"

    let fes = fs.readdirSync(global.Bott.cfgDir, { withFileTypes: true })
        .filter((f) => f.isFile() && /^\d+\.yaml$/.test(f.name))

    logger.info("- 发现机器人配置", `[${fes.length}个]`)
    logger.info(`------------------------`)

    for (let cfg of fes) {
        let cfgP = path.join(global.Bott.cfgDir, cfg.name)
        let cfgY = fs.readFileSync(cfgP, "UTF-8")
        let cfgJ = { file: cfgP, ...yaml.parse(cfgY) }
        global.Bott.set(global.Bott.size + 1, new Bott(cfgJ))
    }

    global.__QQGuild__ = true
}
