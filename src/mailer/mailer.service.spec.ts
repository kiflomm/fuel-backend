import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  it('constructs', () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const svc = new MailerService(config);
    expect(svc).toBeTruthy();
  });
});
