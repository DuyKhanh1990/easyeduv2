export interface ZbsTemplateSendInput {
  accessToken: string;
  userId: string;
  templateId: string;
  templateData: Record<string, unknown>;
}

export class ZbsTemplateChannel {
  readonly enabled = false;

  async send(_input: ZbsTemplateSendInput): Promise<never> {
    throw new Error("ZBS_TEMPLATE_SEND_DISABLED");
  }
}

export const zbsTemplateChannel = new ZbsTemplateChannel();
