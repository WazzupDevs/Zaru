import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { NotificationSendFailedError } from "../../domain/errors/notification-errors";

import type { Env } from "../../../../config/env";
import type {
  SmsSenderPort,
  SmsSendInput,
  SmsSendResult,
} from "../../application/ports/sms-sender.port";

/**
 * Netgsm SMS provider — XML POST to /sms/send/xml.
 *
 * Endpoint: POST https://api.netgsm.com.tr/sms/send/xml
 * Request:  XML envelope with usercode + password + msgheader + msg + no
 * Response: text body, "00 <messageId>" on success; numeric error codes
 *           otherwise (20=insufficient credit, 30=auth, 40=bad msgheader,
 *           50=bad subscriber, 60=invalid number, 70=bad parameters).
 *
 * The factory in notifications.module.ts only wires this adapter when
 * `NETGSM_USERCODE` does NOT start with `DUMMY_`; otherwise MockSmsSender
 * is used. Same dummy-prefix discipline as ADR 0018 / Pricing's
 * Google Maps adapter.
 */
@Injectable()
export class NetgsmSmsSender implements SmsSenderPort {
  private readonly client: AxiosInstance;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @InjectPinoLogger(NetgsmSmsSender.name)
    private readonly logger: PinoLogger,
  ) {
    this.client = axios.create({
      baseURL: "https://api.netgsm.com.tr",
      timeout: 10_000,
      headers: { "Content-Type": "application/xml" },
    });
  }

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const usercode = this.config.get("NETGSM_USERCODE", { infer: true });
    const password = this.config.get("NETGSM_PASSWORD", { infer: true });
    const sender = this.config.get("NETGSM_SENDER", { infer: true });

    // Netgsm wants no leading + (e.g. "905551112233").
    const phoneNoPlus = input.phone.replace(/^\+/, "");
    const xml = this.buildXmlPayload({
      usercode,
      password,
      sender,
      msg: input.message,
      phone: phoneNoPlus,
    });

    let body: string;
    try {
      const res = await this.client.post<string>("/sms/send/xml", xml);
      const data: unknown = res.data;
      body = (typeof data === "string" ? data : JSON.stringify(data)).trim();
    } catch (err) {
      this.logger.error(
        {
          event: "netgsm_send_failed",
          recipientPhone: input.phone,
          err: err instanceof Error ? err.message : String(err),
        },
        "Netgsm HTTP error",
      );
      throw new NotificationSendFailedError("Netgsm transport error");
    }

    // Successful responses Netgsm documents as "00", "01", "02"
    // followed by an optional space + messageId. Anything else is an
    // error code.
    const [code, providerMessageId] = body.split(" ");
    if (code !== "00" && code !== "01" && code !== "02") {
      this.logger.warn(
        { event: "netgsm_send_rejected", recipientPhone: input.phone, code, body },
        "Netgsm rejected the message",
      );
      throw new NotificationSendFailedError(`Netgsm error code: ${code ?? "unknown"}`);
    }

    return {
      providerMessageId: providerMessageId ?? `netgsm-${Date.now().toString()}`,
      sentAt: new Date(),
    };
  }

  private buildXmlPayload(p: {
    usercode: string;
    password: string;
    sender: string;
    msg: string;
    phone: string;
  }): string {
    return `<?xml version="1.0"?>
<mainbody>
  <header>
    <usercode>${p.usercode}</usercode>
    <password>${p.password}</password>
    <msgheader>${p.sender}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${p.msg}]]></msg>
    <no>${p.phone}</no>
  </body>
</mainbody>`.trim();
  }
}
