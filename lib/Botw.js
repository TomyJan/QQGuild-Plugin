import WebSocket from "ws"
import fetch from "node-fetch"

export default class Botw {
    #token
    #apiUrl
    #wssUrl
    #ws
    #isStop
    #session

    constructor(config) {
        this.#token = `Bot ${config.appId}.${config.token}`
    }

    get user() {
        return this.#session?.user
    }

    get id() {
        return this.#session?.user.id
    }

    get name() {
        return this.#session?.user.username
    }

    get isStop() {
        return this.#isStop
    }

    get stateCode() {
        let code
        if (this.#ws instanceof WebSocket) {
            code = this.#ws.readyState
        }
        return code
    }

    get state() {
        let state
        switch (this.stateCode) {
            case 0:
                state = "连接中..."
                break
            case 1:
                state = "已连接."
                break
            case 2:
                state = "正在断开连接..."
                break
            case 3:
                state = "已断开连接."
                break
            default:
                state = "未连接."
        }
        return state
    }

    #makeLog(...logs) {
        let log = "[QQ频道插件]"
        if (this.name) log += `[${this.name}]`
        return [log, ...logs]
    }

    outLogM(...logs) {
        logger.mark(...this.#makeLog(...logs))
    }

    outLogN(...logs) {
        logger.info(...this.#makeLog(...logs))
    }

    outLogW(...logs) {
        logger.warn(...this.#makeLog(...logs))
    }

    outLogE(...logs) {
        logger.error(...this.#makeLog(...logs))
    }

    outLogD(...logs) {
        logger.debug(...this.#makeLog(...logs))
    }

    send(object) {
        if (this.stateCode === 1) {
            this.#ws.send(JSON.stringify(object))
        }
    }

    stop() {
        this.#isStop = true
        if (typeof this.stateCode === "number") {
            this.#ws.terminate()
        }
    }

    async init(config, hMsg) {
        this.#isStop = false

        if (config.sandBox === true) {
            this.#apiUrl = "https://sandbox.api.sgroup.qq.com"
            this.#wssUrl = "wss://sandbox.api.sgroup.qq.com/websocket"
        } else {
            this.#apiUrl = "https://api.sgroup.qq.com"
            this.#wssUrl = "wss://api.sgroup.qq.com/websocket"
        }

        if (config.updateWssUrl === true) {
            let rsp = await this.callApi("/gateway")
            if (rsp?.url) {
                this.#wssUrl = rsp.url
            } else {
                this.outLogW("连接地址更新失败！")
            }
        }

        let heartbeatO = 0
        let heartbeatX = 0
        let heartbeatS = 0

        let heartbeatU = () => {
            this.send({ op: 1, d: null })
        }

        let heartbeatV = () => {
            this.send({ op: 1, d: heartbeatS })
        }

        let isIdentify = true

        let identify = () => {
            this.send({
                op: 2,
                d: {
                    token: this.#token,
                    intents: config.intents
                }
            })
        }

        let resume = () => {
            this.send({
                op: 6,
                d: {
                    token: this.#token,
                    session_id: this.#session.session_id,
                    seq: heartbeatS
                }
            })
        }

        let startConnect = () => {
            this.#ws = new WebSocket(this.#wssUrl)

            this.#ws.on("error", (error) => {
                this.outLogE(error)
            })

            this.#ws.on("close", (code, reason) => {
                if (heartbeatO) heartbeatO = clearInterval(heartbeatO)

                switch (code) {
                    case 4009:
                        isIdentify = false
                        break
                    case 4014:
                        this.outLogW("公域机器人，无法开启全部消息.")
                        this.#isStop = true
                        break
                    case 4914:
                        this.outLogW("机器人已下架，无法连接正式环境.")
                        this.#isStop = true
                        break
                    case 4915:
                        this.outLogW("机器人已封禁，无法连接.")
                        this.#isStop = true
                        break
                    default:
                        isIdentify = true
                }

                if (!this.#isStop) setTimeout(startConnect, config.reConInterval)
            })

            this.#ws.on("message", (data, isBinary) => {
                let msg = JSON.parse(data)

                if (msg.s) heartbeatS = msg.s

                switch (msg.op) {
                    case 0:
                        switch (msg.t) {
                            case "READY":
                                heartbeatU()
                                this.#session = msg.d
                                break
                            case "RESUMED":
                                heartbeatV()
                                break
                            default:
                                hMsg(msg)
                        }
                        return
                    case 10:
                        heartbeatX = msg.d.heartbeat_interval
                        if (isIdentify) {
                            identify()
                        } else {
                            resume()
                        }
                        return
                    case 11:
                        if (!heartbeatO) heartbeatO = setInterval(heartbeatV, heartbeatX)
                        return
                    default:
                        break
                }
            })
        }

        startConnect()
    }

    async callApi(url, option = {}) {
        if (!option.headers) option.headers = {}
        option.headers.Authorization = this.#token
        return await fetch(this.#apiUrl + url, option).then(async (r) => await r.json()).catch((error) => {
            this.outLogE(error)
        })
    }
}
