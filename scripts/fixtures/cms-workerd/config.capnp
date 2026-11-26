using Workerd = import "/workerd/workerd.capnp";
const cmsTests :Workerd.Config = (
  services = [
    (name = "cms", worker = (
      compatibilityDate = "2026-11-04", compatibilityFlags = ["nodejs_compat"],
      globalOutbound = "providers",
      modules = [
        (name = "cms.test.mjs", esModule = embed "cms.test.mjs"),
        (name = "functions/api/cms/callback.js", esModule = embed "../../../functions/api/cms/callback.js"),
        (name = "functions/api/cms/repository.js", esModule = embed "../../../functions/api/cms/repository.js"),
        (name = "server/account.mjs", esModule = embed "../../../server/account.mjs"),
        (name = "server/shared-auth-config.mjs", esModule = embed "../../../server/shared-auth-config.mjs"),
        (name = "server/cms-access.mjs", esModule = embed "../../../server/cms-access.mjs"),
        (name = "server/cms-oauth-failure.mjs", esModule = embed "../../../server/cms-oauth-failure.mjs"),
        (name = "js/site-model.mjs", esModule = embed "../../../js/site-model.mjs"),
        (name = "js/topics.mjs", esModule = embed "../../../js/topics.mjs")
      ]
    )),
    (name = "providers", worker = (
      compatibilityDate = "2026-11-04",
      modules = [(name = "providers.mjs", esModule = embed "providers.mjs")]
    ))
  ]
);
