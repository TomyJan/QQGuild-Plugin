import Botw from "./Botw.js"
import getFaceName from "./FaceMap.js"
import PluginsLoader from "../../../lib/plugins/loader.js"
import { FormData, Blob } from "formdata-node"
import { fileFromPathSync } from "formdata-node/file-from-path"
import fs from "node:fs"
import url from "node:url"

export default class Bott extends Botw {
    #configFile

    constructor(config) {
        super({
            appId: config.appId,
            token: config.token
        })

        this.appId = config.appId
        this.token = config.token
        this.sandBox = config.sandBox === true
        this.allMsg = config.allMsg === true
        this.autoStart = config.autoStart === true
        this.#configFile = config.file

        if (this.autoStart) this.start()
    }

    get configFile() {
        return this.#configFile
    }

    get name() {
        return this.user?.username || this.appId
    }

    async start() {
        if (this.isStop === false) {
            return
        }

        let config = {
            sandBox: this.sandBox,
            intents: 0 | 1 << 12,
            updateWssUrl: false,
            reConInterval: 3000
        }

        if (this.allMsg) {
            config.intents |= 1 << 9
        } else {
            config.intents |= 1 << 30
        }

        this.init(config, (msg) => {
            switch (msg.t) {
                case "DIRECT_MESSAGE_CREATE":
                    this.hDmsCreate(msg.d)
                    return
                case "MESSAGE_CREATE":
                    this.hMsgCreate(msg.d)
                    return
                case "AT_MESSAGE_CREATE":
                    this.hAtMsgCreate(msg.d)
                    return
                default:
                    return
            }
        })
    }

    async hDmsCreate(msg) {
        this.outLogD("私信.收到消息", msg)
        await this.callPlugs(msg, true)
    }

    async hMsgCreate(msg) {
        this.outLogD("子频道.收到消息", msg)
        await this.callPlugs(msg, false)
    }

    async hAtMsgCreate(msg) {
        this.outLogD("子频道.收到消息", msg)
        await this.callPlugs(msg, false)
    }

    async callPlugs(msg, isDms) {
        if (typeof msg.content !== "string") {
            msg.content = ""
        }
        let e = this.makee(msg, isDms)
        if (e) await PluginsLoader.deal(e)
    }

    makee(msg, isDms) {
        let e = isDms ? this.makeePrivate(msg) : this.makeeGroup(msg)

        e.toString = () => {
            return msg.content
                .replace(new RegExp(`\\<@!${this.id}>`, "g"), `{at:${Bot.uin}}`)
                .replace(/\<emoji:(\d+)>/g, "{face:$1}")
                .replace(/\<@!(\d+)>/g, "{at:$1}")
        }

        e.reply = async (m, q) => {
            this.outLogD("回复消息.", m)

            let addImg = (f) => {
                if (Buffer.isBuffer(f)) {
                    return f
                }

                if (typeof f === "string") {
                    let p = f

                    if (/^file:/i.test(f)) {
                        p = f.replace(/^file:\/\//i, "")
                        if (!fs.existsSync(p)) {
                            p = f.replace(/^file:\/\/\//i, "")
                            if (!fs.existsSync(p)) {
                                try {
                                    p = url.fileURLToPath(f)
                                } catch (err) {
                                    this.outLogD("跳过转制图片(File协议不正确).", f, err)
                                    return
                                }
                            }
                        }
                    }

                    if (fs.existsSync(p)) {
                        return fs.readFileSync(p)
                    }
                }
            }

            let addMsg = (m) => {
                switch (typeof m) {
                    case "string":
                        return  m
                    case "number":
                        return `${m}`
                    case "object":
                        switch (m.type) {
                            case "text":
                                return m.text
                            case "face":
                                return `<emoji:${m.id}>`
                            case "at":
                                if (m.id) return `<@!${m.id}>`
                                return m.qq == parseInt(e.user_id) ? `<@!${e.user_id}>` : m.text
                            case "image":
                                return addImg(m.file)
                            default:
                                if (!Array.isArray(m)) {
                                    return
                                }
                        }
                        break
                    default:
                        return
                }


                let msgX = []

                let msgY = {
                    content: "",
                    images: []
                }

                for (let v of m) {
                    let x = addMsg(v)
                    switch (typeof x) {
                        case "string":
                            msgY.content += x
                            continue
                        case "object":
                            if (Buffer.isBuffer(x)) {
                                msgY.images.push(x)
                            } else {
                                msgX = [...msgX, ...x]
                            }
                            continue
                        default:
                            continue
                    }
                }

                if (msgY.content.length || msgY.images.length) {
                    msgX = [msgY, ...msgX]
                }

                return msgX
            }

            let send = async (m) => {
                m.msg_id = msg.id
                if (m.content) {
                    m.content = m.content.trim()
                    if (q) {
                        m = {
                            msg_id: msg.id,
                            content: m.content,
                            message_reference: {
                                message_id: msg.id,
                                ignore_get_message_error: false
                            }
                        }
                    }
                }
                return await this.postMsg(isDms ? msg.guild_id : msg.channel_id, m, isDms)
            }

            let sendMsg = async (m) => {
                switch (typeof m) {
                    case "string":
                        return await send({ content: m })
                    case "object":
                        if (Buffer.isBuffer(m)) {
                            return await send({ file_image: m })
                        }
                        break
                    default:
                        return
                }

                let rsp

                for (let v of m) {
                    let n = {}

                    if (v.content.length) {
                        n.content = v.content
                    }

                    if (v.images.length === 1) {
                        n.file_image = v.images[0]
                    }

                    rsp = await send(n)

                    if (v.images.length > 1) {
                        this.outLogD("开始回复图片. 共", v.images.length, "张")
                        for (let i in v.images) {
                            this.outLogD("回复图片. 第", parseInt(i) + 1, "张")
                            rsp = await send({ file_image: v.images[i] })
                        }
                        this.outLogD("回复图片完成.")
                    }
                }

                return rsp
            }

            let x = addMsg(m)

            this.outLogD("回复消息转制结果.", x)

            let rsp = await sendMsg(x)

            this.outLogD("回复消息结果.", rsp)

            if (rsp?.seq_in_channel) {
                return {
                    seq: rsp.seq_in_channel,
                    rand: 10000000,
                    time: parseInt(Date.parse(rsp.timestamp) / 1000),
                    message_id: rsp.id
                }
            }

            return {}
        }

        this.outLogD("转制消息.", e)

        return e
    }

    makeePrivate(msg) {
        let time = parseInt(Date.parse(msg.timestamp) / 1000)
        let message = this.makeeMessage(msg)
        return {
            ...message,
            post_type: "message",
            message_id: msg.id,
            user_id: msg.author.id,
            time,
            message_type: "private",
            sub_type: "group",
            sender: {
                avatar: msg.author.avatar,
                user_id: msg.author.id,
                nickname: msg.author.username,
                group_id: msg.src_guild_id,
                discuss_id: undefined
            },
            from_id: msg.author.id,
            to_id: Bot.uin,
            font: "宋体",
            seq: msg.seq,
            rand: 10000000,
            auto_reply: false,
            self_id: Bot.uin
        }
    }

    makeeGroup(msg) {
        let time = parseInt(Date.parse(msg.timestamp) / 1000)
        let role = msg.member.roles.includes("4") ? "owner" : msg.member.roles.includes("2") ? "admin" : "member"
        let message = this.makeeMessage(msg)
        let atme = false

        if (Array.isArray(msg.mentions)) for (let at of msg.mentions) {
            if (at.id === this.id) {
                atme = true
                break
            }
        }

        let member = {
            info: {
                group_id: msg.channel_id,
                user_id: msg.author.id,
                nickname: msg.author.username,
                card: msg.author.username,
                sex: "unknown",
                age: 100,
                area: "",
                level: 100,
                rank: "",
                role,
                title: "",
                title_expire_time: 0,
                shutup_time: 0,
                update_time: 0,
                join_time: 0,
                last_sent_time: time
            },
            group_id: msg.guild_id,
            is_admin: role === "owner" || role === "admin",
            is_owner: role === "owner",
            getAvatarUrl: () => {
                return msg.author.avatar
            }
        }

        return {
            ...message,
            post_type: "message",
            message_id: msg.id,
            user_id: msg.author.id,
            time,
            message_type: "group",
            sub_type: "normal",
            sender: {
                user_id: msg.author.id,
                nickname: msg.author.username,
                card: msg.author.username,
                sex: "unknown",
                area: "",
                title: "",
                level: 100,
                age: 100,
                role
            },
            block: false,
            anonymous: null,
            atall: msg.mention_everyone === true,
            group_id: msg.guild_id,
            group_name: "频道插件",
            self_id: Bot.uin,
            font: "宋体",
            seq: msg.seq,
            rand: 10000000,
            atme,
            member,
            group: {
                pickMember: (id) => {
                    if (id === msg.author.id) {
                        return member
                    }
                },
                recallMsg: (msg_id) => {
                    this.delChannelMsg(msg.channel_id, msg_id, false)
                }
            },
            recall: () => {
                this.delChannelMsg(msg.channel_id, msg.id, false)
            }
        }
    }

    makeeMessage(msg) {
        let message = []
        let raw_message = msg.content
        let rex_message = msg.content
        let rex = /(?<t>\<((?<at>@!)|(?<face>emoji):)(?<id>\d+)>)/

        let getAtName = (i) => {
            for (let n of msg.mentions) if (n.id === i) {
                return `@${n.username}`
            }
        }

        while (rex) {
            let r = rex.exec(rex_message)

            if (!r) {
                if (rex_message.length) {
                    rex_message = rex_message.trimStart();
                    if (rex_message.charAt(0) === '/') {
                        rex_message = '#' + rex_message.substring(1);
                        } else {
                            rex_message = '#' + rex_message;
                        }
                        message.push({ type: "text", text: rex_message})
                } 
                break
            }

            if (r.index) {
                message.push({ type: "text", text: rex_message.slice(0, r.index)})
            }

            rex_message = rex_message.slice(r.index + r.groups.t.length)

            if (r.groups.at) {
                let qq = r.groups.id
                let text = getAtName(r.groups.id)
                if (r.groups.id === this.id) qq = Bot.uin
                raw_message = raw_message.replace(r.groups.t, text)
                message.push({ type: "at", qq, text})
                continue
            }

            if (r.groups.face) {
                let text = getFaceName(r.groups.id)
                raw_message = raw_message.replace(r.groups.t, `[${text}]`)
                message.push({ type: "face", id: r.groups.id, text })
                continue
            }
        }

        if (Array.isArray(msg.attachments)) {
            for (let v of msg.attachments) {
                if (v.content_type.startsWith("image/")) {
                    message.push({
                        type: 'image',
                        file: v.filename,
                        url: "https://" + v.url,
                        asface: false
                    })
                    raw_message += "[图片]"
                }
            }
        }

        return { message, raw_message }
    }

    async postMsg(toId, msg, isDms) {
        let _url = `/${isDms === true ? "dms" : "channels"}/${toId}/messages`
        let _option = { method: "POST" }

        if (msg.file_image) {
            _option.body = new FormData()

            if (msg.content) {
                _option.body.set("content", msg.content)
            }

            if (Buffer.isBuffer(msg.file_image)) {
                _option.body.set("file_image", new Blob([msg.file_image]))
            } else {
                if (fs.existsSync(msg.file_image)) {
                    _option.body.set("file_image", fileFromPathSync(msg.file_image))
                }
            }

            if (msg.msg_id) {
                _option.body.set("msg_id", msg.msg_id)
            } else {
                if (msg.event_id) {
                    _option.body.set("event_id", msg.event_id)
                }
            }
        } else {
            _option.headers = { "Content-Type": "application/json" }
            _option.body = JSON.stringify(msg)
        }

        return await this.callApi(_url, _option)
    }

    async delChannelMsg(channel_id, message_id, hidetip) {
        let _url = `/channels/${channel_id}/messages/${message_id}?hidetip=${hidetip === true}`
        let _option = { method: "DELETE" }
        return await this.callApi(_url, _option)
    }
}
