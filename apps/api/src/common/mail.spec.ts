import { BREVO_ENDPOINT, brevoSender, emailLayout, htmlToText, parseSender, senderFromEnv } from './mail';

describe('parseSender', () => {
  it('reads "Name <email>" and bare addresses', () => {
    expect(parseSender('OTD <no-reply@otd.eg>')).toEqual({ name: 'OTD', email: 'no-reply@otd.eg' });
    expect(parseSender('"Outfit The Day" <hello@otd.eg>')).toEqual({ name: 'Outfit The Day', email: 'hello@otd.eg' });
    expect(parseSender('hello@otd.eg')).toEqual({ email: 'hello@otd.eg' });
    expect(parseSender(undefined)).toEqual({ name: 'OTD', email: 'no-reply@otd.eg' });
  });
});

describe('emailLayout', () => {
  it('escapes user-written text but keeps <b> used for amounts', () => {
    const html = emailLayout('en', 'Order <cancelled>', 'Reason: <a href="https://evil.example">click</a> · <b>EGP 10</b>');
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    expect(html).toContain('<b>EGP 10</b>');
    expect(html).toContain('Order &lt;cancelled&gt;');
  });

  it('is right-to-left in Arabic and renders the button and footnote', () => {
    const html = emailLayout('ar', 'عنوان', 'نص', { label: 'زر', url: 'https://otd.eg/ar/reset?token=abc&x=1' }, 'ملاحظة');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('href="https://otd.eg/ar/reset?token=abc&amp;x=1"');
    expect(html).toContain('ملاحظة');
  });
});

describe('htmlToText', () => {
  it('keeps link targets and decodes entities', () => {
    const text = htmlToText(emailLayout('en', 'Reset', 'Hi Sara & co', { label: 'Go', url: 'https://otd.eg/en/reset?token=1' }));
    expect(text).toContain('Go: https://otd.eg/en/reset?token=1');
    expect(text).toContain('Hi Sara & co');
    expect(text).not.toMatch(/<[a-z]/i);
  });
});

describe('brevoSender', () => {
  it('posts the email to the Brevo API with the key and sender', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ messageId: 'x' }) });
    const s = brevoSender('xkeysib-test', 'OTD <no-reply@otd.eg>', fetchMock);
    await s.send({ to: 'sara@example.com', subject: 'Hello', html: '<p>Hi</p>', tags: ['password-reset'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BREVO_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'OTD', email: 'no-reply@otd.eg' },
      to: [{ email: 'sara@example.com' }],
      subject: 'Hello',
      htmlContent: '<p>Hi</p>',
      textContent: 'Hi',
      tags: ['password-reset'],
    });
  });

  it('throws with Brevo’s error message on failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ code: 'unauthorized', message: 'Key not found' }) });
    const s = brevoSender('bad', 'OTD <no-reply@otd.eg>', fetchMock);
    await expect(s.send({ to: 'a@b.co', subject: 's', html: 'h' })).rejects.toThrow('Brevo 401 unauthorized: Key not found');
  });
});

describe('senderFromEnv', () => {
  it('prefers Brevo, then SMTP, else none', () => {
    expect(senderFromEnv({ BREVO_API_KEY: 'k', SMTP_HOST: 'smtp.example' })?.name).toBe('brevo');
    expect(senderFromEnv({ SMTP_HOST: 'smtp.example' })?.name).toBe('smtp');
    expect(senderFromEnv({})).toBeNull();
  });
});
