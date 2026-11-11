# EasyEdu deployment inputs

`kustomization.yaml` is the single image-tag setting for both the app Deployment
and the migration PreSync Job. `deploy-easyedu` should update `images[0].newTag`
to the Harbor tag selected for a release. The GitLab build pipeline is unchanged.

The cluster must provide Secret `easyeduv2-secrets` before sync. It must contain
`DATABASE_URL` for the migration Job and the application's existing secret
environment keys: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AI_ENCRYPT_SECRET`, `SYSTEM_ENCRYPTION_KEY`, `SECRET_KEY_BASE`,
`SESSION_SECRET`, `JWT_SECRET`, `TINODE_API_KEY`, `TINODE_BOT_PASS`,
`TINODE_USER_PASS_SECRET`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
`ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_GATEWAY_SHARED_SECRET`,
`FACEBOOK_WEBHOOK_VERIFY_TOKEN`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
`VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`.

Do not commit Secret values. A missing Secret or failed migration Job blocks
the application rollout.
