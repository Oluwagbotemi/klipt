# Email with Resend

Klipt sends email through [Resend](https://resend.com). Until you set it up, Klipt sends nothing.
Everything still works without email: invitations and ownership transfers are links you copy and
send yourself, and "Forgot password?" is hidden on the sign-in page.

## What Klipt emails

| Email                                | Sent to                                                                    | Can be turned off? |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------ |
| Team invitation (and "Resend email") | The invited address                                                        | No (security)      |
| Password reset link                  | The account's address                                                      | No (security)      |
| Confirm your email                   | New accounts, and the new address after a change                           | No (security)      |
| "Your email was changed"             | The old address after a change                                             | No (security)      |
| Ownership transfer request           | The new owner's address                                                    | No (security)      |
| Transfer accepted / declined         | The previous owner                                                         | No (security)      |
| You were assigned an entry           | The new assignee                                                           | Yes, on `/account` |
| Review requested                     | The assignee if they can publish, otherwise up to 10 owners/admins/editors | Yes                |
| Changes requested (with the note)    | The entry's writer and assignee                                            | Yes                |
| Approved and published / scheduled   | The entry's writer and assignee                                            | Yes                |

Klipt never emails the person who did the action. Emails are sent just after the page responds, so a
slow or failing email never blocks or breaks what you were doing (failures are written to the logs).

## Set it up

You need a Resend account and a domain you control (for example `yourcompany.com`), because email
providers only deliver mail reliably from a domain that has proved it's yours.

1. **Create a Resend account** at [resend.com](https://resend.com) and sign in.
2. **Add your sending domain.** In Resend, open **Domains → Add Domain** and enter the domain (or a
   subdomain such as `mail.yourcompany.com`, which keeps it separate from your normal email). Resend
   shows a few DNS records (usually TXT and MX records for SPF and DKIM).
3. **Add those DNS records** where your domain's DNS is managed (your registrar, Cloudflare, Vercel
   Domains, …), exactly as Resend shows them. Then click **Verify** in Resend. It can take from a few
   minutes to a few hours for DNS changes to be seen. Wait until the domain shows **Verified**.
4. **Create an API key.** In Resend, open **API Keys → Create API Key**. "Sending access" is enough.
   Copy the key (it starts with `re_`); Resend only shows it once.
5. **Add the settings in Vercel.** In your Vercel project, open **Settings → Environment Variables**
   and add, for the **Production** environment:
   - `RESEND_API_KEY`: the key from step 4.
   - `EMAIL_FROM`: who emails come from, using your verified domain, e.g.
     `Klipt <notifications@yourcompany.com>`.
   - Optional `EMAIL_REPLY_TO`: where replies go, e.g. `support@yourcompany.com`.

   We recommend **not** ticking **Preview**: previews then send no real email. (Locally and in
   previews without a key, nothing is sent.)

6. **Redeploy.** Environment variables apply to new deployments: in Vercel open **Deployments**, click
   **⋯** on the latest production deployment and choose **Redeploy**.

Also make sure `BETTER_AUTH_URL` is your real production address (for example
`https://cms.yourcompany.com`): password-reset and confirmation links are built from it.

## Test it

1. Sign out and click **Forgot password?** on the sign-in page. Enter your email and check your
   inbox (and spam folder) for "Reset your Klipt password".
2. In a site, open **Team → Invite member** and invite a second address you can read. The dialog
   should say "We emailed …".
3. If nothing arrives, open Vercel → your project → **Logs** and search for `Couldn't send email`.
   Resend's message (for example that the domain isn't verified) is included there. Resend's own
   dashboard also lists every email it accepted, under **Emails**.

## Limits and costs

Resend has a free plan with a daily and monthly sending limit; check
[Resend's pricing page](https://resend.com/pricing) for the current numbers. Klipt sends a few
emails per action at most (a review request emails at most 10 people), so small teams stay well
within a free plan.

**Without a verified domain**, Resend only lets you send from its test address
`onboarding@resend.dev`, and only to the email address of your own Resend account. That's handy for
a first test (leave `EMAIL_FROM` unset), but invitations to anyone else won't arrive until your
domain is verified.

## Local development

Without `RESEND_API_KEY`, `npm run dev` doesn't send anything: each email is saved as a file in
`.data/emails` instead, and you can read them at
[http://localhost:3000/dev/emails](http://localhost:3000/dev/emails) (only on localhost). Links in
them work, so you can try invitations, password resets and confirmations end to end. To use the
outbox with `npm start`, set `ALLOW_DEV_OUTBOX=1`; never set it on a public deployment, because
outbox emails contain live sign-in links. To send real email locally, put `RESEND_API_KEY` and
`EMAIL_FROM` in `.env.local`.
