#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";

const VERSION = "0.1.13";
const PACKAGE_NAME = "image-skill";
const DEFAULT_API_BASE_URL = "https://api.image-skill.com";
const DEFAULT_DOCS_BASE_URL = "https://image-skill.com";
const DEFAULT_NPM_REGISTRY_BASE_URL = "https://registry.npmjs.org";
const PUBLIC_REPO_URL = "https://github.com/danielgwilson/image-skill-cli";
const PROMPTLESS_EDIT_MODEL_IDS = new Set([
  "fal.flux-dev-redux",
  "fal.flux-krea-redux",
  "fal.flux-schnell-redux",
]);
const DEFAULT_CONFIG_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(os.homedir(), ".config"),
  "image-skill",
  "config.json",
);
const SIGNUP_SUGGESTED_COMMAND =
  "image-skill signup --agent --agent-contact AGENT_OR_OPERATOR_INBOX --agent-name NAME --runtime RUNTIME --save --json";
const SIGNUP_CONTACT_GUIDANCE =
  "Preview signup currently requires an email-shaped durable contact inbox, not an individual human email. Use an agent-owned inbox when available; otherwise use an operator, team, or sponsor inbox that can receive future claim, billing, or abuse notices. Do not block waiting for a person, invent a person, or use a throwaway inbox. --human-email remains a compatibility alias.";
const PAYMENT_CREDENTIAL_FLAGS = new Set([
  "payment-token",
  "payment-secret",
  "payment-required",
  "payment-signature",
  "payment-response",
  "authorization",
  "bearer-token",
  "wallet-private-key",
  "private-key",
  "mnemonic",
  "seed-phrase",
  "card",
  "card-number",
  "card-token",
  "stripe-secret-key",
  "stripe-webhook-secret",
  "provider-key",
  "provider-receipt",
]);

const argv = process.argv.slice(2);
const result = await main(argv);
process.stdout.write(`${JSON.stringify(result.envelope, null, 2)}\n`);
process.exitCode = result.exitCode;

async function main(rawArgv) {
  const [command, ...rest] = rawArgv;

  if (
    command === undefined ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    return success("image-skill help", {
      usage:
        "image-skill <doctor|trust|signup|auth|whoami|usage|quota|credits|models|capabilities|create|upload|edit|assets|jobs|activity|feedback> --json",
      docs_url: "https://image-skill.com/cli.md",
      commands: [
        "doctor",
        "trust",
        "signup --agent --agent-contact",
        "auth status",
        "auth save",
        "auth logout",
        "whoami",
        "usage quota",
        "credits methods",
        "credits packs list",
        "credits quote",
        "credits buy",
        "credits status",
        "models list",
        "models show",
        "create --guide",
        "capabilities list",
        "capabilities show",
        "create",
        "upload",
        "edit",
        "assets show",
        "assets get",
        "jobs show",
        "jobs wait",
        "activity list",
        "activity show",
        "feedback create",
      ],
    });
  }

  if (command === "version" || command === "--version" || command === "-v") {
    return success("image-skill version", {
      version: VERSION,
      package: "image-skill",
      mode: "public_hosted_cli",
    });
  }

  try {
    switch (command) {
      case "doctor":
        return await doctor(rest);
      case "trust":
        return await trust(rest);
      case "signup":
        return await signup(rest);
      case "auth":
        return await auth(rest);
      case "whoami":
        return await whoami(rest);
      case "usage":
        return await usage(rest);
      case "quota":
        return await quota(rest);
      case "credits":
        return await credits(rest);
      case "models":
        return await models(rest);
      case "capabilities":
        return await capabilities(rest);
      case "create":
        return await create(rest);
      case "upload":
        return await upload(rest);
      case "edit":
        return await edit(rest);
      case "assets":
        return await assets(rest);
      case "jobs":
        return await jobs(rest);
      case "activity":
        return await activity(rest);
      case "feedback":
        return await feedback(rest);
      default:
        return failure(
          `image-skill ${command}`,
          2,
          "PUBLIC_CLI_COMMAND_NOT_AVAILABLE",
          `public CLI command is not available: ${command}`,
          false,
          {
            suggested_command: "image-skill help --json",
            docs_url: "https://image-skill.com/cli.md",
          },
        );
    }
  } catch (error) {
    return failure(
      commandLabel(rawArgv),
      1,
      "PUBLIC_CLI_FAILED",
      error instanceof Error ? error.message : "unknown public CLI failure",
      true,
    );
  }
}

async function doctor(argv) {
  const args = parseArgs(argv);
  const apiBaseUrl = apiBase(args);
  const config = await readConfig(configPath());
  const health = await apiRequest({
    command: "image-skill doctor",
    method: "GET",
    apiBaseUrl,
    path: "/healthz",
  });
  return success("image-skill doctor", {
    cli_version: VERSION,
    package: "image-skill",
    mode: "public_hosted_cli",
    api_base_url: apiBaseUrl,
    hosted_api: {
      reachable: health.envelope.ok,
      status: health.envelope.data?.status ?? null,
      api_version: health.envelope.data?.api_version ?? null,
      error: health.envelope.error,
    },
    auth: {
      config_path: configPath(),
      saved_token: config.tokenPresent,
      env_token: hasEnvToken(),
    },
    docs: {
      skill: "https://image-skill.com/skill.md",
      llms: "https://image-skill.com/llms.txt",
      cli: "https://image-skill.com/cli.md",
    },
  });
}

async function trust(argv) {
  const args = parseArgs(argv);
  const unsupportedFlags = [...args.flags.keys()].filter(
    (flag) => !["json", "api-base-url"].includes(flag),
  );
  if (args.positionals.length > 0 || unsupportedFlags.length > 0) {
    return invalid(
      "image-skill trust",
      unsupportedFlags.length > 0
        ? `unsupported flags for trust: ${unsupportedFlags.map((flag) => `--${flag}`).join(", ")}`
        : "trust does not accept positional arguments",
    );
  }

  const checkedAt = new Date().toISOString();
  const apiBaseUrl = apiBase(args);
  const docsBaseUrl = docsBaseForApiBaseUrl(apiBaseUrl);
  const npmRegistryBaseUrl = npmRegistryBaseForApiBaseUrl(apiBaseUrl);

  const [npmPackage, hostedContracts, health, models] = await Promise.all([
    inspectNpmPackage({
      checkedAt,
      registryBaseUrl: npmRegistryBaseUrl,
    }),
    inspectHostedContracts({
      checkedAt,
      docsBaseUrl,
    }),
    apiRequest({
      command: "image-skill trust",
      method: "GET",
      apiBaseUrl,
      path: "/healthz",
    }),
    apiRequest({
      command: "image-skill trust",
      method: "GET",
      apiBaseUrl,
      path: "/v1/models",
    }),
  ]);

  const hostedApi = trustHostedApi(health, apiBaseUrl, checkedAt);
  const modelRegistry = trustModelRegistry(models, apiBaseUrl, checkedAt);
  const publicRepo = trustPublicRepo(npmPackage);
  const proofUrls = trustProofUrls({
    npmPackage,
    hostedContracts,
    publicRepo,
  });
  const warnings = trustWarnings({
    npmPackage,
    hostedContracts,
    hostedApi,
    modelRegistry,
    proofUrls,
  });
  const summary = trustSummary({
    warnings,
    npmPackage,
    hostedContracts,
    hostedApi,
    modelRegistry,
  });

  return success(
    "image-skill trust",
    {
      schema: "image-skill.trust-packet.v0",
      checked_at: checkedAt,
      subject: {
        package: PACKAGE_NAME,
        cli_version: VERSION,
        mode: "public_hosted_cli",
        api_base_url: apiBaseUrl,
        docs_base_url: docsBaseUrl,
        npm_registry_url: npmRegistryBaseUrl,
      },
      summary,
      npm_package: npmPackage,
      public_repo: publicRepo,
      hosted_contracts: hostedContracts,
      hosted_api: hostedApi,
      model_registry: modelRegistry,
      safe_commands: trustSafeCommands(),
      proof_urls: proofUrls,
      redaction: {
        secrets_included: false,
        private_paths_included: false,
        config_file_read: false,
        token_sources_read: false,
        credential_values_read: false,
        forbidden_material:
          "tokens, API keys, private repo paths, provider credentials, payment credentials, card data, wallet secrets, and private package metadata",
      },
    },
    warnings,
  );
}

async function signup(argv) {
  const args = parseArgs(argv);
  if (!flagBool(args, "agent")) {
    return invalid("image-skill signup", "signup currently requires --agent");
  }
  const contact = signupContact(args);
  const agentName = flagString(args, "agent-name");
  const runtime = flagString(args, "runtime");
  if (!contact.ok) {
    return failure(
      "image-skill signup",
      2,
      "INVALID_ARGUMENTS",
      contact.message,
      false,
      {
        required_flags: ["--agent-contact", "--agent-name", "--runtime"],
        suggested_command: SIGNUP_SUGGESTED_COMMAND,
        docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
      },
    );
  }
  if (contact.value === null || agentName === null || runtime === null) {
    return failure(
      "image-skill signup",
      2,
      "INVALID_ARGUMENTS",
      `signup requires --agent-contact, --agent-name, and --runtime. ${SIGNUP_CONTACT_GUIDANCE}`,
      false,
      {
        required_flags: ["--agent-contact", "--agent-name", "--runtime"],
        accepted_aliases: {
          "--human-email": "--agent-contact",
        },
        suggested_command: SIGNUP_SUGGESTED_COMMAND,
        docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
      },
    );
  }
  const save = shouldSaveSignupAuth(args);
  const showToken = flagBool(args, "show-token");
  if (save) {
    const configReady = await assertConfigWritable("image-skill signup");
    if (!configReady.ok) {
      return configReady.result;
    }
  }
  const result = await apiRequest({
    command: "image-skill signup",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/agent-signups",
    body: {
      human_email: contact.value,
      agent_name: agentName,
      runtime,
      return_token: save || showToken,
    },
  });
  result.envelope.command = "image-skill signup";
  rewriteSignupContactFailure(result);

  const token = result.envelope.data?.token;
  const warnings = [...result.envelope.warnings];
  if (result.envelope.ok && save) {
    if (typeof token !== "string" || token.trim().length === 0) {
      return failure(
        "image-skill signup",
        3,
        "SIGNUP_TOKEN_NOT_RETURNED",
        "signup default auth persistence requires a returned hosted token",
        true,
        {
          suggested_command: SIGNUP_SUGGESTED_COMMAND,
          docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
        },
      );
    }
    try {
      await saveConfig({
        api_base_url: apiBase(args),
        token,
        saved_at: new Date().toISOString(),
        actor: result.envelope.actor ?? result.envelope.data?.actor ?? null,
      });
    } catch (error) {
      return configWriteFailure("image-skill signup", error);
    }
    warnings.push(`saved hosted token to ${configPath()}`);
  }

  if (result.envelope.data && typeof result.envelope.data === "object") {
    const publicData = publicSignupData(result.envelope.data);
    result.envelope.data = {
      ...publicData,
      token: showToken ? (token ?? publicData.token ?? null) : null,
      token_presented: showToken,
      storage: {
        ...(publicData.storage ?? {}),
        saved: save,
        config_path: save ? configPath() : null,
        reason: save
          ? "public CLI saved token locally with 0600 permissions"
          : "token not saved; later hosted commands need saved auth, IMAGE_SKILL_TOKEN, or --token-stdin",
      },
    };
  }
  result.envelope.warnings = warnings;
  return result;
}

function rewriteSignupContactFailure(result) {
  const error = result.envelope.error;
  if (
    error !== null &&
    typeof error === "object" &&
    error.message === "human_email must be a valid email address"
  ) {
    error.message =
      "preview signup currently requires --agent-contact to be an email-shaped durable contact inbox; it does not need to belong to an individual human";
    error.recovery = {
      ...(error.recovery ?? {}),
      suggested_command: SIGNUP_SUGGESTED_COMMAND,
      docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
    };
  }
}

function publicSignupData(data) {
  const { human_email: humanEmail, ...rest } = data;
  return {
    ...rest,
    ...(typeof humanEmail === "string" ? { agent_contact: humanEmail } : {}),
  };
}

async function auth(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(rest);
  if (subcommand === "status") {
    const token = await resolveToken(args);
    if (!token.ok) {
      return success("image-skill auth status", {
        authenticated: false,
        source: null,
        config_path: configPath(),
      });
    }
    const result = await apiRequest({
      command: "image-skill auth status",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: "/v1/whoami",
      token: token.token,
    });
    if (result.envelope.data && typeof result.envelope.data === "object") {
      result.envelope.data = {
        ...result.envelope.data,
        auth_source: token.source,
      };
    }
    return result;
  }
  if (subcommand === "save") {
    const token = await resolveToken(args, { allowSaved: false });
    if (!token.ok) {
      return token.result;
    }
    const configReady = await assertConfigWritable("image-skill auth save");
    if (!configReady.ok) {
      return configReady.result;
    }
    try {
      await saveConfig({
        api_base_url: apiBase(args),
        token: token.token,
        saved_at: new Date().toISOString(),
        actor: null,
      });
    } catch (error) {
      return configWriteFailure("image-skill auth save", error);
    }
    return success("image-skill auth save", {
      saved: true,
      config_path: configPath(),
      token_source: token.source,
    });
  }
  if (subcommand === "logout") {
    await rm(configPath(), { force: true });
    return success("image-skill auth logout", {
      saved: false,
      config_path: configPath(),
    });
  }
  return invalid("image-skill auth", "auth requires status, save, or logout");
}

async function whoami(argv) {
  const args = parseArgs(argv);
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  return apiRequest({
    command: "image-skill whoami",
    method: "GET",
    apiBaseUrl: apiBase(args),
    path: "/v1/whoami",
    token: token.token,
  });
}

async function usage(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand.startsWith("-")) {
    return await quota(argv, "image-skill usage quota");
  }
  if (subcommand !== "quota") {
    return invalid("image-skill usage", "usage requires the quota subcommand");
  }
  return quota(rest, "image-skill usage quota");
}

async function quota(argv, command = "image-skill quota") {
  const args = parseArgs(argv);
  const token = await resolveToken(args);
  if (!token.ok) {
    return withCommand(token.result, command);
  }
  return withCommand(
    await apiRequest({
      command,
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: "/v1/quota",
      token: token.token,
    }),
    command,
  );
}

async function credits(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand === "methods") {
    const args = parseArgs(rest);
    const unknownFlags = [...args.flags.keys()].filter(
      (flag) => !["json", "api-base-url"].includes(flag),
    );
    if (!flagBool(args, "json")) {
      return invalid(
        "image-skill credits methods",
        "credits methods requires --json",
      );
    }
    if (args.positionals.length > 0 || unknownFlags.length > 0) {
      return invalid(
        "image-skill credits methods",
        unknownFlags.length > 0
          ? `unsupported flags for credits methods: ${unknownFlags.map((flag) => `--${flag}`).join(", ")}`
          : "credits methods does not accept positional arguments",
      );
    }
    return apiRequest({
      command: "image-skill credits methods",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: "/v1/payment-methods",
    });
  }
  if (subcommand === "packs") {
    const [packsSubcommand, ...packsRest] = rest;
    if (packsSubcommand !== "list") {
      return invalid(
        "image-skill credits packs",
        "credits packs requires the list subcommand",
      );
    }
    const args = parseArgs(packsRest);
    return apiRequest({
      command: "image-skill credits packs list",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: "/v1/credit-packs",
    });
  }
  if (subcommand === "quote") {
    const args = parseArgs(rest);
    const credentialFlag = rejectPaymentCredentialFlags(
      args,
      "image-skill credits quote",
    );
    if (credentialFlag !== null) {
      return credentialFlag;
    }
    const token = await resolveToken(args);
    if (!token.ok) {
      return token.result;
    }
    const creditsValue = flagNumber(args, "credits");
    const pack = flagString(args, "pack");
    if (creditsValue === null && pack === null) {
      return invalid(
        "image-skill credits quote",
        "credits quote requires --pack PACK_ID or --credits N",
      );
    }
    const idempotency = optionalIdempotencyKey(args, "quote");
    const paymentMethod =
      flagString(args, "payment-method") ?? "stripe_checkout";
    if (paymentMethod !== "stripe_checkout") {
      return invalid(
        "image-skill credits quote",
        "public credits quote supports --payment-method stripe_checkout",
      );
    }
    const body = {
      ...(creditsValue === null ? {} : { credits: creditsValue }),
      ...(pack === null ? {} : { pack_id: pack }),
      payment_method: paymentMethod,
      idempotency_key: idempotency.value,
    };
    const result = await apiRequest({
      command: "image-skill credits quote",
      method: "POST",
      apiBaseUrl: apiBase(args),
      path: "/v1/credit-quotes",
      token: token.token,
      body,
    });
    if (idempotency.generated) {
      result.envelope.warnings.push(
        `generated idempotency key ${idempotency.value}; pass --idempotency-key for stable retries`,
      );
    }
    return result;
  }
  if (subcommand === "buy") {
    const args = parseArgs(rest);
    const credentialFlag = rejectPaymentCredentialFlags(
      args,
      "image-skill credits buy",
    );
    if (credentialFlag !== null) {
      return credentialFlag;
    }
    const provider = flagString(args, "provider");
    if (provider !== "stripe") {
      return invalid(
        "image-skill credits buy",
        "credits buy currently supports only --provider stripe",
      );
    }
    const quoteId = flagString(args, "quote-id");
    if (quoteId === null) {
      return invalid(
        "image-skill credits buy",
        "credits buy requires --quote-id",
      );
    }
    const token = await resolveToken(args);
    if (!token.ok) {
      return token.result;
    }
    const idempotency = requiredIdempotencyKey(
      args,
      "image-skill credits buy",
      "credits buy creates or replays a payment purchase and requires --idempotency-key for retry-safe payment mutation",
    );
    if (!idempotency.ok) {
      return idempotency.result;
    }
    const result = await apiRequest({
      command: "image-skill credits buy",
      method: "POST",
      apiBaseUrl: apiBase(args),
      path: "/v1/credit-purchases/stripe-checkout-sessions",
      token: token.token,
      body: {
        quote_id: quoteId,
        idempotency_key: idempotency.value,
      },
    });
    return withStripeCheckoutCopyFallback(result);
  }
  if (subcommand === "status") {
    const args = parseArgs(rest);
    const token = await resolveToken(args);
    if (!token.ok) {
      return token.result;
    }
    const query = new URLSearchParams();
    addQueryFlag(query, args, "quote-id", "quote_id");
    addQueryFlag(query, args, "payment-attempt-id", "payment_attempt_id");
    addQueryFlag(query, args, "checkout-session-id", "checkout_session_id");
    addQueryFlag(query, args, "receipt-id", "receipt_id");
    const result = await apiRequest({
      command: "image-skill credits status",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/credit-purchases/status?${query.toString()}`,
      token: token.token,
    });
    return withStripeCheckoutCopyFallback(result);
  }
  return invalid(
    "image-skill credits",
    "credits requires methods, packs, quote, buy, or status",
  );
}

async function models(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(
    subcommand === "list" || subcommand === "show" ? rest : argv,
  );
  if (subcommand === "show") {
    const modelId = args.positionals[0];
    if (modelId === undefined) {
      return invalid(
        "image-skill models show",
        "models show requires MODEL_ID",
      );
    }
    return apiRequest({
      command: "image-skill models show",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/models/${encodeURIComponent(modelId)}`,
    });
  }
  if (
    subcommand !== undefined &&
    subcommand !== "list" &&
    !subcommand.startsWith("--")
  ) {
    return invalid("image-skill models", "models supports list or show");
  }
  const query = modelListQuery(args);
  if (!query.ok) {
    return invalid(
      subcommand === "list" ? "image-skill models list" : "image-skill models",
      query.message,
    );
  }
  return apiRequest({
    command:
      subcommand === "list" ? "image-skill models list" : "image-skill models",
    method: "GET",
    apiBaseUrl: apiBase(args),
    path: query.path,
  });
}

function modelListQuery(args) {
  const available = flagBool(args, "available");
  const executable = flagBool(args, "executable");
  const catalogOnly = flagBool(args, "catalog-only");
  if (catalogOnly && (available || executable)) {
    return {
      ok: false,
      message:
        "models list --catalog-only cannot be combined with --available or --executable",
    };
  }
  const params = new URLSearchParams();
  if (available) {
    params.set("available", "true");
  }
  if (executable) {
    params.set("executable", "true");
  }
  if (catalogOnly) {
    params.set("catalog_only", "true");
  }
  addQueryValue(params, "operation", flagString(args, "operation"));
  addQueryValue(params, "provider", flagString(args, "provider"));
  const query = params.toString();
  return {
    ok: true,
    path: query.length === 0 ? "/v1/models" : `/v1/models?${query}`,
  };
}

function addQueryValue(params, name, value) {
  if (typeof value === "string" && value.trim().length > 0) {
    params.set(name, value.trim());
  }
}

async function capabilities(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(
    subcommand === "list" || subcommand === "show" ? rest : argv,
  );
  if (subcommand === "show") {
    const capabilityId = args.positionals[0];
    if (capabilityId === undefined) {
      return invalid(
        "image-skill capabilities show",
        "capabilities show requires CAPABILITY_ID",
      );
    }
    return apiRequest({
      command: "image-skill capabilities show",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/capabilities/${encodeURIComponent(capabilityId)}`,
    });
  }
  if (
    subcommand !== undefined &&
    subcommand !== "list" &&
    !subcommand.startsWith("--")
  ) {
    return invalid(
      "image-skill capabilities",
      "capabilities supports list or show",
    );
  }
  return apiRequest({
    command:
      subcommand === "list"
        ? "image-skill capabilities list"
        : "image-skill capabilities",
    method: "GET",
    apiBaseUrl: apiBase(args),
    path: "/v1/capabilities",
  });
}

async function createGuide(args) {
  if (flagBool(args, "dry-run")) {
    return invalid(
      "image-skill create --guide",
      "create --guide cannot be combined with --dry-run; the guide returns the dry-run escape hatch separately",
    );
  }
  if (hasReferenceFlags(args)) {
    return invalid(
      "image-skill create --guide",
      "create --guide does not upload or resolve reference images; inspect the model with models show, then run create --dry-run before live referenced creates",
    );
  }
  const modelParameters = jsonObjectFlag(args, "model-parameters-json");
  if (!modelParameters.ok) {
    return modelParameters.result;
  }

  const apiBaseUrl = apiBase(args);
  const prompt = flagString(args, "prompt") ?? args.positionals[0] ?? "";
  const trimmedPrompt = prompt.trim();
  const requestedModelId = flagString(args, "model");
  const requestedProviderId = flagString(args, "provider");
  const requestedIntent = flagString(args, "intent") ?? "explore";
  const health = await apiRequest({
    command: "image-skill create --guide",
    method: "GET",
    apiBaseUrl,
    path: "/healthz",
  });
  const models = await apiRequest({
    command: "image-skill create --guide",
    method: "GET",
    apiBaseUrl,
    path: "/v1/models",
  });
  const payments = await apiRequest({
    command: "image-skill create --guide",
    method: "GET",
    apiBaseUrl,
    path: "/v1/payment-methods",
  });
  const token = await resolveToken(args, { allowMissing: true });
  if (!token.ok) {
    return token.result;
  }

  const selected =
    models.envelope.ok && models.envelope.data?.models
      ? selectCreateGuideModel(models.envelope.data.models, requestedModelId)
      : null;
  const pricing = selected?.economics?.credit_pricing ?? null;
  const estimatedCredits = pricing?.credits_required ?? null;
  const estimatedUsdPerImage =
    selected?.economics?.estimated_usd_per_image ??
    (pricing === null ? null : pricing.estimated_revenue_usd);
  const budgetGuard =
    flagNumber(args, "max-estimated-usd-per-image") ??
    estimatedUsdPerImage ??
    (estimatedCredits === null ? 0.07 : estimatedCredits / 100);
  const quota =
    token.token === null
      ? null
      : await apiRequest({
          command: "image-skill create --guide",
          method: "GET",
          apiBaseUrl,
          path: "/v1/quota",
          token: token.token,
        });
  const paymentSummary = createGuidePaymentSummary(payments.envelope.data);
  const stage = createGuideStage({
    prompt: trimmedPrompt,
    health,
    models,
    selected,
    token,
    quota,
    estimatedCredits,
  });
  const blocker = createGuideBlocker(stage, {
    requestedModelId,
    quota,
    estimatedCredits,
  });
  const nextCommand = createGuideNextCommand(stage, {
    prompt: trimmedPrompt,
    selected,
    requestedProviderId,
    requestedIntent,
    budgetGuard,
    apiBaseUrl: explicitApiBaseUrl(args),
    paymentSummary,
  });
  const afterNext =
    stage === "auth_required" || stage === "quota_required"
      ? renderGuideCommand(trimmedPrompt, explicitApiBaseUrl(args))
      : null;
  return success("image-skill create --guide", {
    schema: "image-skill.create-guide.v1",
    ready: stage === "ready_to_create",
    stage,
    checks: {
      hosted_api: {
        reachable: health.envelope.ok,
        status: health.envelope.data?.status ?? null,
        api_base_url: apiBaseUrl,
        error_code: health.envelope.error?.code ?? null,
      },
      auth: {
        source: token.source === "anonymous" ? "none" : token.source,
        authenticated: quota?.envelope.data?.authenticated === true,
        claim_state: quota?.envelope.data?.claim_state ?? null,
        token_status: quota?.envelope.data?.token_status ?? null,
        saved_config_path: configPath(),
      },
      models: {
        reachable: models.envelope.ok,
        executable_count: models.envelope.data?.summary?.executable ?? 0,
        cataloged_not_wired_count:
          models.envelope.data?.summary?.cataloged_not_wired ?? 0,
        error_code: models.envelope.error?.code ?? null,
      },
      quota: {
        checked: quota !== null,
        authenticated: quota?.envelope.data?.authenticated === true,
        remaining_credits: quotaRemainingCredits(quota?.envelope.data ?? null),
        required_credits: estimatedCredits,
        daily_jobs_remaining:
          quota?.envelope.data?.daily_jobs?.remaining ?? null,
        reason:
          quota === null
            ? "auth_required"
            : quota.envelope.ok
              ? null
              : (quota.envelope.error?.code ?? "quota_unavailable"),
      },
      payments: paymentSummary,
    },
    selection:
      selected === null
        ? null
        : {
            operation: "create",
            model_id: selected.id,
            model_status: selected.status,
            model_execution_status: selected.execution.model_execution_status,
            reason:
              requestedModelId === null
                ? "default executable create model for first image"
                : "requested executable create model",
          },
    cost: {
      estimated_credits: estimatedCredits,
      estimated_usd_per_image: estimatedUsdPerImage,
      pricing_confidence: pricing?.pricing_confidence ?? null,
    },
    blocker,
    next_command: nextCommand,
    after_next: afterNext,
    escape_hatches: {
      doctor: "image-skill doctor --json",
      model_inspection:
        selected === null
          ? "image-skill models list --json"
          : `image-skill models show ${shellQuote(selected.id)} --json`,
      payment_methods: "image-skill credits methods --json",
      quota: "image-skill usage quota --json",
      dry_run:
        selected === null || trimmedPrompt.length === 0
          ? "image-skill create --dry-run --prompt PROMPT --json"
          : renderCreateCommand({
              prompt: trimmedPrompt,
              modelId: selected.id,
              providerId: requestedProviderId,
              intent: requestedIntent,
              budgetGuard,
              dryRun: true,
              apiBaseUrl: explicitApiBaseUrl(args),
            }),
    },
    mutation: {
      provider_call: false,
      hosted_create: false,
      hosted_signup: false,
      payment_object: false,
      credit_debit: false,
      media_write: false,
    },
  });
}

function selectCreateGuideModel(models, requestedModelId) {
  const isExecutableCreate = (model) =>
    model?.status === "available" &&
    model?.execution?.model_execution_status === "executable" &&
    Array.isArray(model?.supports) &&
    model.supports.includes("create");
  if (requestedModelId !== null) {
    const requested = models.find((model) => model.id === requestedModelId);
    return requested !== undefined && isExecutableCreate(requested)
      ? requested
      : null;
  }
  return models.find(isExecutableCreate) ?? null;
}

function createGuidePaymentSummary(data) {
  const methods = Array.isArray(data?.methods)
    ? data.methods.filter((method) => method.live_money)
    : [];
  return {
    checked: data !== null && typeof data === "object",
    live_money_methods: methods
      .filter((method) => method.available)
      .map((method) => method.method_id),
    requires_browser: methods.some((method) => method.requires_browser),
    buyer_modes: [
      ...new Set(methods.flatMap((method) => method.buyer_modes ?? [])),
    ],
    suggested_commands: [
      "image-skill credits methods --json",
      "image-skill credits packs list --json",
      methods[0]?.recovery?.quote_command ??
        "image-skill credits quote --pack starter-500 --payment-method stripe_checkout --idempotency-key KEY --json",
      methods[0]?.recovery?.purchase_command ??
        "image-skill credits buy --provider stripe --quote-id QUOTE_ID --idempotency-key KEY --json",
      methods[0]?.recovery?.status_command ??
        "image-skill credits status --payment-attempt-id PAYMENT_ATTEMPT_ID --json",
    ],
  };
}

function createGuideStage(input) {
  if (input.prompt.length === 0) {
    return "prompt_required";
  }
  if (!input.health.envelope.ok || !input.models.envelope.ok) {
    return "service_unreachable";
  }
  if (input.selected === null) {
    return "no_executable_model";
  }
  if (input.token.token === null) {
    return "auth_required";
  }
  if (input.quota === null || !input.quota.envelope.ok) {
    return input.quota?.envelope.error?.code === "AUTH_REQUIRED"
      ? "auth_required"
      : "service_unreachable";
  }
  const remaining = quotaRemainingCredits(input.quota.envelope.data);
  if (
    input.estimatedCredits !== null &&
    remaining !== null &&
    remaining < input.estimatedCredits
  ) {
    return "quota_required";
  }
  if (
    input.quota.envelope.data?.daily_jobs !== undefined &&
    input.quota.envelope.data.daily_jobs.remaining <= 0
  ) {
    return "quota_required";
  }
  return "ready_to_create";
}

function createGuideBlocker(stage, input) {
  if (stage === "ready_to_create") {
    return null;
  }
  if (stage === "prompt_required") {
    return {
      code: "prompt_required",
      message: "Add --prompt so the guide can return the exact create command.",
    };
  }
  if (stage === "no_executable_model") {
    return {
      code: "no_executable_model",
      message:
        input.requestedModelId === null
          ? "No available executable create model was found in the public registry."
          : `Requested model is not currently an available executable create model: ${input.requestedModelId}`,
    };
  }
  if (stage === "auth_required") {
    return {
      code: "auth_required",
      message:
        "Sign up once with a durable agent contact before creating hosted media.",
    };
  }
  if (stage === "quota_required") {
    const remaining = quotaRemainingCredits(input.quota?.envelope.data ?? null);
    return {
      code: "quota_required",
      message: `Selected first image requires ${input.estimatedCredits ?? "unknown"} credits; current remaining credits are ${remaining ?? "unknown"}.`,
    };
  }
  return {
    code: "service_unreachable",
    message:
      input.quota?.envelope.error?.message ??
      "Guide could not complete read-only hosted or registry checks.",
  };
}

function createGuideNextCommand(stage, input) {
  if (stage === "prompt_required") {
    return renderGuideCommand("PROMPT", input.apiBaseUrl);
  }
  if (stage === "no_executable_model" || stage === "service_unreachable") {
    return "image-skill models list --json";
  }
  if (stage === "auth_required") {
    return "image-skill signup --agent --agent-contact AGENT_OR_OPERATOR_INBOX --agent-name AGENT_NAME --runtime RUNTIME_NAME --save --json";
  }
  if (stage === "quota_required") {
    return input.paymentSummary.suggested_commands[0];
  }
  return renderCreateCommand({
    prompt: input.prompt,
    modelId: input.selected.id,
    providerId: input.requestedProviderId,
    intent: input.requestedIntent,
    budgetGuard: input.budgetGuard,
    dryRun: false,
    apiBaseUrl: input.apiBaseUrl,
  });
}

function renderGuideCommand(prompt, apiBaseUrl) {
  return [
    "image-skill create --guide --prompt",
    shellQuote(prompt),
    ...(apiBaseUrl === null ? [] : ["--api-base-url", shellQuote(apiBaseUrl)]),
    "--json",
  ].join(" ");
}

function renderCreateCommand(input) {
  return [
    "image-skill create",
    ...(input.dryRun ? ["--dry-run"] : []),
    ...(input.providerId === null
      ? []
      : ["--provider", shellQuote(input.providerId)]),
    "--model",
    shellQuote(input.modelId),
    "--prompt",
    shellQuote(input.prompt),
    "--intent",
    shellQuote(input.intent),
    "--max-estimated-usd-per-image",
    shellQuote(formatUsd(input.budgetGuard)),
    ...(input.apiBaseUrl === null
      ? []
      : ["--api-base-url", shellQuote(input.apiBaseUrl)]),
    "--json",
  ].join(" ");
}

function explicitApiBaseUrl(args) {
  return flagString(args, "api-base-url");
}

function formatUsd(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function shellQuote(value) {
  return JSON.stringify(value);
}

function quotaRemainingCredits(data) {
  if (data === null || data === undefined) {
    return null;
  }
  const limits = data.limits ?? {};
  const freeCredits =
    typeof limits.remaining_credits === "number" ? limits.remaining_credits : 0;
  const paidCredits =
    typeof limits.payment_backed_remaining_credits === "number"
      ? limits.payment_backed_remaining_credits
      : 0;
  return freeCredits + paidCredits;
}

async function create(argv) {
  const args = parseArgs(argv);
  if (flagBool(args, "guide")) {
    return createGuide(args);
  }
  const prompt = await promptValue(args);
  if (!prompt.ok) {
    return prompt.result;
  }
  let referenceToken = null;
  if (flagBool(args, "dry-run") && hasReferenceFlags(args)) {
    referenceToken = await resolveToken(args);
    if (!referenceToken.ok) {
      return referenceToken.result;
    }
  }
  const referencePlan = parseReferencePlan(args, "image-skill create");
  if (!referencePlan.ok) {
    return referencePlan.result;
  }
  const anonymousDryRun =
    flagBool(args, "dry-run") && referencePlan.referencePlans.length === 0;
  const token =
    referenceToken ??
    (await resolveToken(args, { allowMissing: anonymousDryRun }));
  if (!token.ok) {
    return token.result;
  }
  const modelParameters = jsonObjectFlag(args, "model-parameters-json");
  if (!modelParameters.ok) {
    return modelParameters.result;
  }
  const outputCount = positiveIntegerFlag(args, "output-count", {
    command: "image-skill create",
  });
  if (!outputCount.ok) {
    return outputCount.result;
  }
  const references =
    token.token === null
      ? { ok: true, references: [] }
      : await resolveReferences(
          referencePlan.referencePlans,
          args,
          token.token,
        );
  if (!references.ok) {
    return references.result;
  }
  return apiRequest({
    command: "image-skill create",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/create",
    ...(token.token === null ? {} : { token: token.token }),
    body: {
      prompt: prompt.value,
      ...(flagString(args, "provider") === null
        ? {}
        : { provider: flagString(args, "provider") }),
      ...(flagString(args, "model") === null
        ? {}
        : { model: flagString(args, "model") }),
      ...(flagString(args, "intent") === null
        ? {}
        : { intent: flagString(args, "intent") }),
      aspect_ratio: flagString(args, "aspect-ratio") ?? "1:1",
      ...(references.references.length === 0
        ? {}
        : { references: references.references }),
      ...(outputCount.value === null
        ? {}
        : { output_count: outputCount.value }),
      ...(flagNumber(args, "max-estimated-usd-per-image") === null
        ? {}
        : {
            max_estimated_usd_per_image: flagNumber(
              args,
              "max-estimated-usd-per-image",
            ),
          }),
      ...(modelParameters.value === null
        ? {}
        : { model_parameters: modelParameters.value }),
      dry_run: flagBool(args, "dry-run"),
      accept_unknown_cost: flagBool(args, "accept-unknown-cost"),
    },
  });
}

async function upload(argv) {
  const args = parseArgs(argv);
  const input = flagString(args, "input") ?? args.positionals[0];
  if (input === undefined) {
    return invalid("image-skill upload", "upload requires PATH_OR_URL");
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  const uploadBody = await uploadPayload(input);
  if (!uploadBody.ok) {
    return uploadBody.result;
  }
  return apiRequest({
    command: "image-skill upload",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/upload",
    token: token.token,
    body: uploadBody.body,
  });
}

async function edit(argv) {
  const args = parseArgs(argv);
  const input = flagString(args, "input") ?? args.positionals[0];
  const modelId = flagString(args, "model");
  if (input === undefined) {
    return invalid(
      "image-skill edit",
      "edit requires --input ASSET_ID_OR_PATH_OR_URL",
    );
  }
  const prompt = await editPromptValue(args, modelId);
  if (!prompt.ok) {
    return prompt.result;
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  const referencePlan = parseReferencePlan(args, "image-skill edit");
  if (!referencePlan.ok) {
    return referencePlan.result;
  }
  const assetId = await resolveInputAssetId(input, args, token.token);
  if (!assetId.ok) {
    return assetId.result;
  }
  const mask = flagString(args, "mask");
  const maskAssetId =
    mask === null ? null : await resolveInputAssetId(mask, args, token.token);
  if (maskAssetId !== null && !maskAssetId.ok) {
    return maskAssetId.result;
  }
  const references = await resolveReferences(
    referencePlan.referencePlans,
    args,
    token.token,
  );
  if (!references.ok) {
    return references.result;
  }
  const modelParameters = jsonObjectFlag(args, "model-parameters-json");
  if (!modelParameters.ok) {
    return modelParameters.result;
  }
  return apiRequest({
    command: "image-skill edit",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/edit",
    token: token.token,
    body: {
      input_asset_id: assetId.assetId,
      ...(maskAssetId === null ? {} : { mask_asset_id: maskAssetId.assetId }),
      ...(references.references.length === 0
        ? {}
        : { references: references.references }),
      ...(prompt.value.length === 0 ? {} : { prompt: prompt.value }),
      ...(flagString(args, "provider") === null
        ? {}
        : { provider: flagString(args, "provider") }),
      ...(modelId === null ? {} : { model: modelId }),
      ...(flagString(args, "intent") === null
        ? {}
        : { intent: flagString(args, "intent") }),
      aspect_ratio: flagString(args, "aspect-ratio") ?? "auto",
      ...(flagNumber(args, "max-estimated-usd-per-image") === null
        ? {}
        : {
            max_estimated_usd_per_image: flagNumber(
              args,
              "max-estimated-usd-per-image",
            ),
          }),
      ...(modelParameters.value === null
        ? {}
        : { model_parameters: modelParameters.value }),
      accept_unknown_cost: flagBool(args, "accept-unknown-cost"),
    },
  });
}

async function assets(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(rest);
  const reference = args.positionals[0] ?? flagString(args, "id");
  if (reference === undefined || reference === null) {
    return invalid("image-skill assets", "assets requires an asset id or URL");
  }
  const assetId = assetIdFromReference(reference);
  if (assetId === null) {
    return invalid(
      "image-skill assets",
      "assets currently supports Image Skill asset ids and media.image-skill.com URLs",
    );
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  if (subcommand === "show") {
    return apiRequest({
      command: "image-skill assets show",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/assets/${encodeURIComponent(assetId)}`,
      token: token.token,
    });
  }
  if (subcommand === "get") {
    const shown = await apiRequest({
      command: "image-skill assets get",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/assets/${encodeURIComponent(assetId)}`,
      token: token.token,
    });
    if (!shown.envelope.ok) {
      return shown;
    }
    const asset = shown.envelope.data?.asset ?? shown.envelope.data;
    const output =
      flagString(args, "output") ?? deriveAssetGetOutputPath(asset);
    const downloaded = await downloadUrl(asset.url, output, {
      overwrite: flagBool(args, "overwrite"),
    });
    if (!downloaded.ok) {
      return downloaded.result;
    }
    shown.envelope.command = "image-skill assets get";
    shown.envelope.data = {
      request: {
        reference,
        reference_type: reference === assetId ? "asset_id" : "url",
      },
      asset,
      download: downloaded.data,
    };
    return shown;
  }
  return invalid("image-skill assets", "assets requires show or get");
}

async function jobs(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(rest);
  const jobId = args.positionals[0] ?? flagString(args, "job-id");
  if (jobId === undefined || jobId === null) {
    return invalid("image-skill jobs", "jobs requires JOB_ID");
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  if (subcommand === "show") {
    return apiRequest({
      command: "image-skill jobs show",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/jobs/${encodeURIComponent(jobId)}`,
      token: token.token,
    });
  }
  if (subcommand === "wait") {
    const timeoutMs = flagNumber(args, "timeout-ms") ?? 30_000;
    const pollIntervalMs = flagNumber(args, "poll-interval-ms") ?? 1_000;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      const current = await apiRequest({
        command: "image-skill jobs wait",
        method: "GET",
        apiBaseUrl: apiBase(args),
        path: `/v1/jobs/${encodeURIComponent(jobId)}`,
        token: token.token,
      });
      if (!current.envelope.ok) {
        return current;
      }
      const status = current.envelope.data?.job?.status;
      if (
        status === "completed" ||
        status === "failed" ||
        status === "canceled"
      ) {
        current.envelope.data.request = {
          ...(current.envelope.data.request ?? {}),
          timeout_ms: timeoutMs,
          poll_interval_ms: pollIntervalMs,
        };
        return current;
      }
      await sleep(pollIntervalMs);
    }
    return failure(
      "image-skill jobs wait",
      8,
      "TIMEOUT",
      `job ${jobId} did not reach a terminal state within ${timeoutMs}ms`,
      true,
      { retry_after_seconds: Math.ceil(pollIntervalMs / 1000) },
    );
  }
  return invalid("image-skill jobs", "jobs requires show or wait");
}

async function activity(argv) {
  const [subcommand, ...rest] = argv;
  const args = parseArgs(rest);
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  if (subcommand === "show") {
    const reference = args.positionals[0] ?? flagString(args, "reference");
    if (reference === undefined || reference === null) {
      return invalid(
        "image-skill activity show",
        "activity show requires REFERENCE",
      );
    }
    return apiRequest({
      command: "image-skill activity show",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/activity/${encodeURIComponent(reference)}`,
      token: token.token,
    });
  }
  if (subcommand === "list") {
    const query = new URLSearchParams();
    const limit = flagNumber(args, "limit");
    if (limit !== null) {
      query.set("limit", String(limit));
    }
    const subject = flagString(args, "subject");
    if (subject !== null) {
      query.set("subject", subject);
    }
    return apiRequest({
      command: "image-skill activity list",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/activity${query.size > 0 ? `?${query.toString()}` : ""}`,
      token: token.token,
    });
  }
  return invalid("image-skill activity", "activity requires list or show");
}

async function feedback(argv) {
  const [subcommand, ...rest] = argv;
  if (subcommand !== "create") {
    return invalid("image-skill feedback", "feedback requires create");
  }
  const args = parseArgs(rest);
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  const title = flagString(args, "title");
  const body = flagString(args, "body");
  if (title === null && body === null) {
    return invalid(
      "image-skill feedback create",
      "feedback create requires --title or --body",
    );
  }
  return apiRequest({
    command: "image-skill feedback create",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/feedback",
    token: token.token,
    body: {
      type: flagString(args, "type") ?? "user_feedback",
      ...(title === null ? {} : { title }),
      ...(body === null ? {} : { body }),
      severity: flagString(args, "severity") ?? "medium",
      confidence: flagString(args, "confidence") ?? "medium",
      next_state: flagString(args, "next-state") ?? "watch",
      ...(flagString(args, "command") === null
        ? {}
        : { command: flagString(args, "command") }),
      ...(flagString(args, "expected") === null
        ? {}
        : { expected: flagString(args, "expected") }),
      ...(flagString(args, "actual") === null
        ? {}
        : { actual: flagString(args, "actual") }),
      ...(flagString(args, "friction") === null
        ? {}
        : { friction: flagString(args, "friction") }),
      ...(flagString(args, "proof-needed") === null
        ? {}
        : { proof_needed: flagString(args, "proof-needed") }),
      ...(flagString(args, "strategic-reason") === null
        ? {}
        : { strategic_reason: flagString(args, "strategic-reason") }),
      ...(flagString(args, "dedupe-key") === null
        ? {}
        : { dedupe_key: flagString(args, "dedupe-key") }),
      ...(flagString(args, "source") === null
        ? {}
        : { source: flagString(args, "source") }),
      ...(flagString(args, "trace-id") === null
        ? {}
        : { trace_id: flagString(args, "trace-id") }),
      surface: csvFlag(args, "surface", ["cli"]),
      evidence: csvFlag(args, "evidence", []),
      ...(flagBool(args, "allow-weak-signal")
        ? { allow_weak_signal: true }
        : {}),
    },
  });
}

async function resolveInputAssetId(input, args, token) {
  const direct = assetIdFromReference(input);
  if (direct !== null) {
    return { ok: true, assetId: direct };
  }
  const payload = await uploadPayload(input);
  if (!payload.ok) {
    return payload;
  }
  const uploaded = await apiRequest({
    command: "image-skill upload",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/upload",
    token,
    body: payload.body,
  });
  if (!uploaded.envelope.ok) {
    return { ok: false, result: uploaded };
  }
  const assetId = uploaded.envelope.data?.asset?.asset_id;
  if (typeof assetId !== "string") {
    return {
      ok: false,
      result: failure(
        "image-skill upload",
        9,
        "UPLOAD_ASSET_ID_MISSING",
        "hosted upload did not return an asset id",
        true,
      ),
    };
  }
  return { ok: true, assetId };
}

function parseReferencePlan(args, command) {
  for (const flag of [
    "element-frontal",
    "element-reference",
    "reference-image",
  ]) {
    if (
      args.flags.has(flag) &&
      args.flags.get(flag)?.some((value) => typeof value !== "string")
    ) {
      return {
        ok: false,
        result: invalid(command, `--${flag} requires an image`),
      };
    }
  }
  const referencePlans = [];
  for (const value of flagStrings(args, "element-frontal")) {
    const parsed = parseElementReferenceFlag(value, {
      flag: "--element-frontal",
      allowReferenceIndex: false,
      command,
    });
    if (!parsed.ok) {
      return parsed;
    }
    referencePlans.push({
      input: parsed.input,
      role: "element_frontal",
      index: parsed.index,
      referenceIndex: null,
      referenceTask: null,
    });
  }
  for (const value of flagStrings(args, "element-reference")) {
    const parsed = parseElementReferenceFlag(value, {
      flag: "--element-reference",
      allowReferenceIndex: true,
      command,
    });
    if (!parsed.ok) {
      return parsed;
    }
    referencePlans.push({
      input: parsed.input,
      role: "element_reference",
      index: parsed.index,
      referenceIndex: parsed.referenceIndex,
      referenceTask: null,
    });
  }
  for (const value of flagStrings(args, "reference-image")) {
    const parsed = parseReferenceImageFlag(value, {
      flag: "--reference-image",
      command,
    });
    if (!parsed.ok) {
      return parsed;
    }
    referencePlans.push({
      input: parsed.input,
      role: "reference_image",
      index: parsed.index,
      referenceIndex: null,
      referenceTask: parsed.referenceTask,
    });
  }
  const planValidation = validateElementReferencePlan(referencePlans, command);
  if (!planValidation.ok) {
    return planValidation;
  }
  return { ok: true, referencePlans };
}

function hasReferenceFlags(args) {
  return (
    args.flags.has("element-frontal") ||
    args.flags.has("element-reference") ||
    args.flags.has("reference-image")
  );
}

async function resolveReferences(referencePlans, args, token) {
  const references = [];
  for (const plan of referencePlans) {
    const assetId = await resolveInputAssetId(plan.input, args, token);
    if (!assetId.ok) {
      return assetId;
    }
    if (plan.role === "element_frontal") {
      references.push({
        asset_id: assetId.assetId,
        role: "element_frontal",
        index: plan.index,
      });
      continue;
    }
    if (plan.role === "reference_image") {
      references.push({
        asset_id: assetId.assetId,
        role: "reference_image",
        index: plan.index,
        ...(plan.referenceTask === null
          ? {}
          : { reference_task: plan.referenceTask }),
      });
      continue;
    }
    references.push({
      asset_id: assetId.assetId,
      role: "element_reference",
      index: plan.index,
      ...(plan.referenceIndex === null
        ? {}
        : { reference_index: plan.referenceIndex }),
    });
  }
  return { ok: true, references };
}

function validateElementReferencePlan(referencePlans, command) {
  if (referencePlans.length === 0) {
    return { ok: true };
  }
  const frontals = new Set();
  const referencesByElement = new Map();
  const elementIndexes = new Set();
  for (const plan of referencePlans) {
    if (plan.role === "reference_image") {
      continue;
    }
    elementIndexes.add(plan.index);
    if (plan.role === "element_frontal") {
      if (frontals.has(plan.index)) {
        return {
          ok: false,
          result: invalid(
            command,
            `only one --element-frontal is allowed for element ${plan.index}`,
          ),
        };
      }
      frontals.add(plan.index);
    } else {
      const count = referencesByElement.get(plan.index) ?? 0;
      referencesByElement.set(plan.index, count + 1);
    }
  }

  const sortedIndexes = [...elementIndexes].sort((left, right) => left - right);
  for (let expected = 0; expected < sortedIndexes.length; expected += 1) {
    if (sortedIndexes[expected] !== expected) {
      return {
        ok: false,
        result: invalid(
          command,
          "element indexes must be contiguous starting at 0",
        ),
      };
    }
  }
  for (const [index, count] of referencesByElement.entries()) {
    if (!frontals.has(index)) {
      return {
        ok: false,
        result: invalid(
          command,
          `--element-reference for element ${index} requires --element-frontal for the same element`,
        ),
      };
    }
    if (count > 3) {
      return {
        ok: false,
        result: invalid(
          command,
          `element ${index} accepts at most 3 --element-reference images`,
        ),
      };
    }
  }
  const referenceImageIndexes = new Set();
  for (const plan of referencePlans) {
    if (plan.role !== "reference_image") {
      continue;
    }
    if (referenceImageIndexes.has(plan.index)) {
      return {
        ok: false,
        result: invalid(
          command,
          `only one --reference-image is allowed for index ${plan.index}`,
        ),
      };
    }
    referenceImageIndexes.add(plan.index);
  }
  const sortedReferenceImageIndexes = [...referenceImageIndexes].sort(
    (left, right) => left - right,
  );
  for (
    let expected = 0;
    expected < sortedReferenceImageIndexes.length;
    expected += 1
  ) {
    if (sortedReferenceImageIndexes[expected] !== expected) {
      return {
        ok: false,
        result: invalid(
          command,
          "reference image indexes must be contiguous starting at 0",
        ),
      };
    }
  }
  return { ok: true };
}

function parseReferenceImageFlag(value, options) {
  const parsed = parseReferenceImageSuffix(value);
  if (parsed.input.length === 0) {
    return {
      ok: false,
      result: invalid(options.command, `${options.flag} requires an image`),
    };
  }
  if (parsed.index > 9) {
    return {
      ok: false,
      result: invalid(
        options.command,
        `${options.flag} index must be between 0 and 9`,
      ),
    };
  }
  return { ok: true, ...parsed };
}

function parseReferenceImageSuffix(value) {
  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) {
    return { input: value, index: 0, referenceTask: null };
  }
  const suffix = value.slice(atIndex + 1);
  if (!/^\d+(?::(?:ip|id|style))?$/.test(suffix)) {
    return { input: value, index: 0, referenceTask: null };
  }
  const [index, referenceTask] = suffix.split(":");
  return {
    input: value.slice(0, atIndex),
    index: Number(index),
    referenceTask: referenceTask ?? null,
  };
}

function parseElementReferenceFlag(value, options) {
  const parsed = parseElementReferenceSuffix(value);
  if (parsed.input.length === 0) {
    return {
      ok: false,
      result: invalid(options.command, `${options.flag} requires an image`),
    };
  }
  if (!options.allowReferenceIndex && parsed.referenceIndex !== null) {
    return {
      ok: false,
      result: invalid(
        options.command,
        `${options.flag} accepts IMAGE[@ELEMENT_INDEX], not a reference index`,
      ),
    };
  }
  if (parsed.index > 9) {
    return {
      ok: false,
      result: invalid(
        options.command,
        `${options.flag} element index must be between 0 and 9`,
      ),
    };
  }
  if (parsed.referenceIndex !== null && parsed.referenceIndex > 2) {
    return {
      ok: false,
      result: invalid(
        options.command,
        `${options.flag} reference index must be between 0 and 2`,
      ),
    };
  }
  return { ok: true, ...parsed };
}

function parseElementReferenceSuffix(value) {
  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) {
    return { input: value, index: 0, referenceIndex: null };
  }
  const suffix = value.slice(atIndex + 1);
  if (!/^\d+(?::\d+)?$/.test(suffix)) {
    return { input: value, index: 0, referenceIndex: null };
  }
  const [index, referenceIndex] = suffix.split(":").map((part) => Number(part));
  return {
    input: value.slice(0, atIndex),
    index,
    referenceIndex: referenceIndex ?? null,
  };
}

async function uploadPayload(input) {
  const isRemote = /^https?:\/\//i.test(input);
  let bytes;
  let filename;
  let remoteOrigin = null;
  let mimeType;
  if (isRemote) {
    const url = new URL(input);
    const response = await fetch(url);
    if (!response.ok) {
      return {
        ok: false,
        result: failure(
          "image-skill upload",
          7,
          "REMOTE_UPLOAD_FETCH_FAILED",
          `could not fetch remote upload URL: HTTP ${response.status}`,
          true,
        ),
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    bytes = Buffer.from(arrayBuffer);
    filename = basename(url.pathname) || "remote-upload";
    remoteOrigin = url.origin;
    mimeType =
      response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ??
      mimeFromFilename(filename);
  } else {
    const filePath = resolve(input);
    bytes = await readFile(filePath);
    filename = basename(filePath);
    mimeType = mimeFromFilename(filename);
  }
  if (mimeType === null) {
    return {
      ok: false,
      result: failure(
        "image-skill upload",
        2,
        "UPLOAD_MIME_TYPE_UNKNOWN",
        "could not infer MIME type; use png, jpg, jpeg, webp, gif, or avif",
        false,
      ),
    };
  }
  return {
    ok: true,
    body: {
      source_kind: isRemote ? "remote_url" : "local_path",
      filename,
      remote_origin: remoteOrigin,
      mime_type: mimeType,
      content_length: bytes.byteLength,
      sha256: sha256Hex(bytes),
      bytes_base64: bytes.toString("base64"),
    },
  };
}

async function inspectNpmPackage(input) {
  const registryUrl = new URL(
    `${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(VERSION)}`,
    ensureTrailingSlash(input.registryBaseUrl),
  ).toString();
  const fetched = await fetchPublicJson(registryUrl, {
    accept: "application/vnd.npm.install-v1+json, application/json",
  });
  if (!fetched.ok) {
    return {
      status: fetched.statusCode === 404 ? "not_available_yet" : "unreachable",
      checked_at: input.checkedAt,
      package: PACKAGE_NAME,
      version: VERSION,
      registry_url: registryUrl,
      dist_integrity: null,
      tarball: null,
      git_head: null,
      repository_url: null,
      attestation: {
        status: "not_available_yet",
        url: null,
      },
      error: fetched.error,
    };
  }

  const parsed = isRecord(fetched.json) ? fetched.json : {};
  const dist = isRecord(parsed.dist) ? parsed.dist : {};
  const repository = isRecord(parsed.repository) ? parsed.repository : {};
  const attestationUrl =
    isRecord(dist.attestations) && typeof dist.attestations.url === "string"
      ? dist.attestations.url
      : null;
  const version = typeof parsed.version === "string" ? parsed.version : VERSION;
  return {
    status: version === VERSION ? "verified" : "mismatched",
    checked_at: input.checkedAt,
    package: PACKAGE_NAME,
    version,
    expected_version: VERSION,
    registry_url: registryUrl,
    dist_integrity: typeof dist.integrity === "string" ? dist.integrity : null,
    tarball: typeof dist.tarball === "string" ? dist.tarball : null,
    git_head: typeof parsed.gitHead === "string" ? parsed.gitHead : null,
    repository_url:
      typeof repository.url === "string" ? repository.url : PUBLIC_REPO_URL,
    attestation: {
      status: attestationUrl === null ? "not_available_yet" : "available",
      url: attestationUrl,
    },
    error: null,
  };
}

async function inspectHostedContracts(input) {
  const contracts = [
    { key: "skill", path: "/skill.md" },
    { key: "llms", path: "/llms.txt" },
    { key: "cli", path: "/cli.md" },
  ];
  const entries = [];
  for (const contract of contracts) {
    const url = new URL(
      contract.path,
      ensureTrailingSlash(input.docsBaseUrl),
    ).toString();
    const fetched = await fetchPublicText(url, {
      accept: "text/markdown, text/plain, */*",
    });
    entries.push({
      key: contract.key,
      url,
      status: fetched.ok ? "verified" : "unreachable",
      http_status: fetched.statusCode,
      content_sha256:
        fetched.text === null
          ? null
          : `sha256:${sha256Hex(Buffer.from(fetched.text, "utf8"))}`,
      bytes:
        fetched.text === null ? null : Buffer.byteLength(fetched.text, "utf8"),
      error: fetched.error,
    });
  }
  const verified = entries.filter((entry) => entry.status === "verified");
  return {
    status: verified.length === entries.length ? "verified" : "unreachable",
    checked_at: input.checkedAt,
    contracts: entries,
  };
}

function trustHostedApi(health, apiBaseUrl, checkedAt) {
  return {
    status: health.envelope.ok ? "reachable" : "unreachable",
    checked_at: checkedAt,
    url: new URL("/healthz", ensureTrailingSlash(apiBaseUrl)).toString(),
    reachable: health.envelope.ok,
    api_status: health.envelope.data?.status ?? null,
    api_version: health.envelope.data?.api_version ?? null,
    error: health.envelope.error,
  };
}

function trustModelRegistry(models, apiBaseUrl, checkedAt) {
  const data = isRecord(models.envelope.data) ? models.envelope.data : {};
  const modelList = Array.isArray(data.models) ? data.models : [];
  const counted = countModelAvailability(modelList);
  const summary = isRecord(data.summary) ? data.summary : {};
  const executable = numberOrFallback(summary.executable, counted.executable);
  const catalogedNotWired = numberOrFallback(
    summary.cataloged_not_wired,
    counted.cataloged_not_wired,
  );
  const unavailable = numberOrFallback(
    summary.unavailable,
    counted.unavailable,
  );
  return {
    status: models.envelope.ok ? "available" : "unreachable",
    checked_at: checkedAt,
    url: new URL("/v1/models", ensureTrailingSlash(apiBaseUrl)).toString(),
    freshness: {
      source: "hosted /v1/models",
      checked_at: checkedAt,
    },
    availability_summary: {
      total: numberOrFallback(summary.total, modelList.length),
      returned: numberOrFallback(summary.returned, modelList.length),
      executable,
      cataloged_not_wired: catalogedNotWired,
      unavailable,
      providers: counted.providers,
      status_counts: counted.status_counts,
    },
    rules: [
      "Prefer executable models for create/edit.",
      "Treat cataloged_not_wired as inspect-only evidence, not spend-ready capability.",
      "Run models show MODEL_ID before using provider-native model parameters.",
    ],
    error: models.envelope.error,
  };
}

function trustPublicRepo(npmPackage) {
  const repoUrl = publicRepoUrlFromNpm(npmPackage.repository_url);
  return {
    status: repoUrl === null ? "unknown" : "checked",
    url: repoUrl,
    git_head: npmPackage.git_head,
    package_registry_url: npmPackage.registry_url,
    main_may_be_newer_than_package: true,
    note: "npm gitHead is the package-source commit when present; public main can move ahead between releases.",
  };
}

function trustProofUrls(input) {
  return {
    npm_package: {
      status: input.npmPackage.status,
      url: input.npmPackage.registry_url,
    },
    npm_attestation: input.npmPackage.attestation,
    public_repo: {
      status: input.publicRepo.status,
      url: input.publicRepo.url,
      git_head: input.publicRepo.git_head,
    },
    hosted_contracts: {
      status: input.hostedContracts.status,
      urls: input.hostedContracts.contracts.map((contract) => contract.url),
    },
    real_agent_studies: {
      status: "not_available_yet",
      url: null,
    },
  };
}

function trustWarnings(input) {
  const warnings = [];
  if (input.npmPackage.status !== "verified") {
    warnings.push(`npm package metadata is ${input.npmPackage.status}`);
  }
  if (input.npmPackage.git_head === null) {
    warnings.push("npm package gitHead is not available");
  }
  if (input.npmPackage.attestation.status !== "available") {
    warnings.push("npm provenance attestation URL is not available yet");
  }
  if (input.hostedContracts.status !== "verified") {
    warnings.push("one or more hosted contract documents could not be hashed");
  }
  if (input.hostedApi.status !== "reachable") {
    warnings.push("hosted API health is unreachable");
  }
  if (input.modelRegistry.status !== "available") {
    warnings.push("hosted model registry is unreachable");
  }
  const availability = input.modelRegistry.availability_summary;
  if (availability.executable === 0) {
    warnings.push("hosted model registry reports zero executable models");
  }
  if (availability.cataloged_not_wired > 0) {
    warnings.push(
      `hosted model registry reports ${availability.cataloged_not_wired} cataloged_not_wired model(s)`,
    );
  }
  if (input.proofUrls.real_agent_studies.status === "not_available_yet") {
    warnings.push("real-agent study proof URL is not available yet");
  }
  return warnings;
}

function trustSummary(input) {
  const hasMismatch =
    input.npmPackage.status === "mismatched" ||
    input.hostedContracts.status === "mismatched";
  const availability = input.modelRegistry.availability_summary;
  let status;
  if (input.hostedApi.status !== "reachable") {
    status = "unavailable";
  } else if (hasMismatch) {
    status = "stale_or_mismatched";
  } else if (
    input.modelRegistry.status !== "available" ||
    availability.executable === 0
  ) {
    status = "inspect_only";
  } else if (input.warnings.length > 0) {
    status = "usable_with_warnings";
  } else {
    status = "usable";
  }
  return {
    status,
    selection_hint: trustSelectionHint(status),
    top_warnings: input.warnings.slice(0, 5),
  };
}

function trustSelectionHint(status) {
  if (status === "usable" || status === "usable_with_warnings") {
    return "Use create --guide as the first creative command; use trust output as selection evidence, not as a required setup step.";
  }
  if (status === "inspect_only") {
    return "Inspect docs and model metadata, but do not assume spend-ready image generation until executable models and health are available.";
  }
  if (status === "stale_or_mismatched") {
    return "Do not rely on this package/contract combination until the mismatch is resolved or a newer package is selected.";
  }
  return "Do not select Image Skill for new work until hosted health and model registry checks recover.";
}

function trustSafeCommands() {
  return [
    {
      purpose: "trust_packet",
      command: "npx -y image-skill@latest trust --json",
      mutation: false,
      spend: false,
    },
    {
      purpose: "first_image_guide",
      command:
        'npx -y image-skill@latest create --guide --prompt "a compact field camera on a stainless workbench" --json',
      mutation: false,
      spend: false,
    },
    {
      purpose: "model_inspection",
      command: "npx -y image-skill@latest models list --json",
      mutation: false,
      spend: false,
    },
  ];
}

function countModelAvailability(models) {
  const statusCounts = {};
  const providers = new Set();
  let executable = 0;
  let catalogedNotWired = 0;
  let unavailable = 0;
  for (const model of models) {
    if (!isRecord(model)) {
      continue;
    }
    const providerId = modelProviderId(model);
    if (providerId !== null) {
      providers.add(providerId);
    }
    const status = modelAvailabilityStatus(model);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (status === "executable" || status === "available") {
      executable += 1;
    }
    if (status === "cataloged_not_wired") {
      catalogedNotWired += 1;
    }
    if (model.status === "unavailable" || status === "unavailable") {
      unavailable += 1;
    }
  }
  return {
    executable,
    cataloged_not_wired: catalogedNotWired,
    unavailable,
    providers: [...providers].sort(),
    status_counts: statusCounts,
  };
}

function modelProviderId(model) {
  if (typeof model.provider_id === "string") {
    return model.provider_id;
  }
  if (isRecord(model.provider) && typeof model.provider.id === "string") {
    return model.provider.id;
  }
  if (typeof model.id === "string" && model.id.includes(".")) {
    return model.id.split(".")[0];
  }
  return null;
}

function modelAvailabilityStatus(model) {
  if (
    isRecord(model.execution) &&
    typeof model.execution.model_execution_status === "string"
  ) {
    return model.execution.model_execution_status;
  }
  if (typeof model.availability_reason === "string") {
    return model.availability_reason;
  }
  if (typeof model.status === "string") {
    return model.status;
  }
  return "unknown";
}

function numberOrFallback(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function publicRepoUrlFromNpm(repositoryUrl) {
  if (typeof repositoryUrl !== "string" || repositoryUrl.trim().length === 0) {
    return PUBLIC_REPO_URL;
  }
  return repositoryUrl
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^ssh:\/\/git@github.com\//, "https://github.com/");
}

function docsBaseForApiBaseUrl(apiBaseUrl) {
  return sameBaseUrl(apiBaseUrl, DEFAULT_API_BASE_URL)
    ? DEFAULT_DOCS_BASE_URL
    : apiBaseUrl;
}

function npmRegistryBaseForApiBaseUrl(apiBaseUrl) {
  return sameBaseUrl(apiBaseUrl, DEFAULT_API_BASE_URL)
    ? DEFAULT_NPM_REGISTRY_BASE_URL
    : apiBaseUrl;
}

function sameBaseUrl(left, right) {
  return stripTrailingSlash(left) === stripTrailingSlash(right);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function fetchPublicJson(url, options = {}) {
  const fetched = await fetchPublicText(url, options);
  if (!fetched.ok || fetched.text === null) {
    return { ...fetched, json: null };
  }
  try {
    return { ...fetched, json: JSON.parse(fetched.text) };
  } catch {
    return {
      ...fetched,
      ok: false,
      json: null,
      error: {
        code: "PUBLIC_JSON_PARSE_FAILED",
        message: "public metadata endpoint returned non-JSON content",
        retryable: true,
      },
    };
  }
}

async function fetchPublicText(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: options.accept ?? "*/*",
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      url: response.url,
      text,
      error: response.ok
        ? null
        : {
            code: "PUBLIC_FETCH_FAILED",
            message: `public HTTP GET returned ${response.status}`,
            retryable: response.status >= 500,
          },
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      url,
      text: null,
      error: {
        code: "PUBLIC_FETCH_FAILED",
        message:
          error instanceof Error ? error.message : "public HTTP GET failed",
        retryable: true,
      },
    };
  }
}

async function apiRequest(input) {
  const url = new URL(input.path, ensureTrailingSlash(input.apiBaseUrl));
  try {
    const response = await fetch(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(input.token === undefined
          ? {}
          : { authorization: `Bearer ${input.token}` }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const text = await response.text();
    const envelope = parseEnvelope(text, input.command, response.status);
    const exitCodeHeader = response.headers.get("x-image-skill-exit-code");
    return {
      exitCode:
        exitCodeHeader === null
          ? envelope.ok
            ? 0
            : exitCodeForStatus(response.status)
          : Number(exitCodeHeader),
      envelope,
    };
  } catch (error) {
    return failure(
      input.command,
      7,
      "HOSTED_API_REQUEST_FAILED",
      error instanceof Error ? error.message : "hosted API request failed",
      true,
      {
        suggested_command: "image-skill doctor --json",
        docs_url: "https://image-skill.com/cli.md",
        retry_after_seconds: 30,
      },
    );
  }
}

function parseEnvelope(text, command, statusCode) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      return parsed;
    }
  } catch {
    // Fall through to normalized public error.
  }
  return {
    ok: false,
    command,
    trace_id: traceId(),
    actor: null,
    data: null,
    warnings: [],
    error: {
      code: "HOSTED_API_NON_JSON_RESPONSE",
      message: `hosted API returned HTTP ${statusCode} without a JSON envelope`,
      retryable: statusCode >= 500,
    },
  };
}

function withStripeCheckoutCopyFallback(result) {
  const data = result.envelope.data;
  if (!isRecord(data)) {
    return result;
  }

  const updated = stripeCheckoutCopyFallbackData(data);
  if (updated === data) {
    return result;
  }

  return {
    ...result,
    envelope: {
      ...result.envelope,
      data: updated,
    },
  };
}

function stripeCheckoutCopyFallbackData(data) {
  let changed = false;
  const updated = { ...data };

  if (addCheckoutCompactUrl(updated)) {
    changed = true;
  }

  if (isRecord(updated.next)) {
    const next = { ...updated.next };
    let nextChanged = addCheckoutCompactUrl(next);
    if (
      typeof updated.checkout_compact_url === "string" &&
      typeof next.checkout_compact_url !== "string"
    ) {
      next.checkout_compact_url = updated.checkout_compact_url;
      nextChanged = true;
    }
    if (nextChanged) {
      updated.next = next;
      changed = true;
    }
  }

  if (isRecord(updated.payment_attempt)) {
    const paymentAttempt = { ...updated.payment_attempt };
    if (addCheckoutCompactUrl(paymentAttempt)) {
      updated.payment_attempt = paymentAttempt;
      changed = true;
    }
    if (isRecord(updated.next)) {
      const next = { ...updated.next };
      if (
        next.human_action === "open_checkout_url" &&
        typeof paymentAttempt.checkout_compact_url === "string" &&
        typeof next.checkout_compact_url !== "string"
      ) {
        next.checkout_compact_url = paymentAttempt.checkout_compact_url;
        updated.next = next;
        changed = true;
      }
    }
  }

  return changed ? updated : data;
}

function addCheckoutCompactUrl(record) {
  const handoff =
    typeof record.checkout_handoff_url === "string"
      ? record.checkout_handoff_url
      : null;
  if (handoff !== null && handoff.length > 0) {
    let changed = false;
    if (record.checkout_compact_url !== handoff) {
      record.checkout_compact_url = handoff;
      changed = true;
    }
    return changed;
  }

  const raw =
    typeof record.checkout_url === "string"
      ? record.checkout_url
      : typeof record.fallback_checkout_url === "string"
        ? record.fallback_checkout_url
        : null;
  if (raw === null || raw.length === 0) {
    return false;
  }
  const compact = stripeCheckoutCompactUrl(raw);
  let changed = false;
  if (record.checkout_compact_url !== compact) {
    record.checkout_compact_url = compact;
    changed = true;
  }
  return changed;
}

function stripeCheckoutCompactUrl(checkoutUrl) {
  const trimmed = checkoutUrl.trim();
  if (trimmed.length === 0) {
    return checkoutUrl;
  }
  return trimmed;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function promptValue(args) {
  const prompt = flagString(args, "prompt");
  const promptFile = flagString(args, "prompt-file");
  if (prompt !== null && promptFile !== null) {
    return {
      ok: false,
      result: invalid(
        "image-skill create",
        "provide either --prompt or --prompt-file, not both",
      ),
    };
  }
  if (prompt !== null) {
    return { ok: true, value: prompt };
  }
  if (promptFile !== null) {
    return { ok: true, value: await readFile(promptFile, "utf8") };
  }
  return {
    ok: false,
    result: invalid("image-skill create", "create/edit requires --prompt"),
  };
}

async function editPromptValue(args, modelId) {
  if (args.flags.has("prompt") && flagString(args, "prompt") === null) {
    return {
      ok: false,
      result: invalid("image-skill edit", "--prompt requires a value"),
    };
  }
  if (
    args.flags.has("prompt-file") &&
    flagString(args, "prompt-file") === null
  ) {
    return {
      ok: false,
      result: invalid("image-skill edit", "--prompt-file requires a value"),
    };
  }
  const prompt = flagString(args, "prompt");
  const promptFile = flagString(args, "prompt-file");
  if (prompt !== null && promptFile !== null) {
    return {
      ok: false,
      result: invalid(
        "image-skill edit",
        "provide either --prompt or --prompt-file, not both",
      ),
    };
  }
  const isPromptlessModel =
    modelId !== null && PROMPTLESS_EDIT_MODEL_IDS.has(modelId);
  let value = null;
  if (prompt !== null) {
    value = prompt;
  } else if (promptFile !== null) {
    value = await readFile(promptFile, "utf8");
  }
  const trimmed = value?.trim() ?? "";
  if (isPromptlessModel) {
    if (trimmed.length > 0) {
      return {
        ok: false,
        result: invalid(
          "image-skill edit",
          `model ${modelId} does not accept --prompt`,
        ),
      };
    }
    return { ok: true, value: "" };
  }
  if (value === null) {
    return {
      ok: false,
      result: invalid("image-skill edit", "edit requires --prompt"),
    };
  }
  if (trimmed.length === 0) {
    return {
      ok: false,
      result: invalid("image-skill edit", "edit prompt cannot be empty"),
    };
  }
  return { ok: true, value: trimmed };
}

async function resolveToken(args, options = {}) {
  if (flagBool(args, "token-stdin")) {
    if (process.stdin.isTTY) {
      return {
        ok: false,
        result: failure(
          commandLabel(process.argv.slice(2)),
          2,
          "INVALID_ARGUMENTS",
          "--token-stdin requires a token piped on stdin",
          false,
        ),
      };
    }
    const token = (await readStdin()).trim();
    if (token.length === 0) {
      return {
        ok: false,
        result: failure(
          commandLabel(process.argv.slice(2)),
          3,
          "AUTH_REQUIRED",
          "--token-stdin received empty stdin",
          false,
        ),
      };
    }
    return { ok: true, token, source: "stdin" };
  }
  const flagToken = flagString(args, "token");
  if (flagToken !== null) {
    return { ok: true, token: flagToken, source: "flag" };
  }
  const envToken =
    process.env.IMAGE_SKILL_TOKEN ?? process.env.IMAGE_SKILL_HOSTED_TOKEN;
  if (envToken !== undefined && envToken.trim().length > 0) {
    return { ok: true, token: envToken.trim(), source: "env" };
  }
  if (options.allowSaved !== false) {
    const config = await readConfig(configPath());
    if (typeof config.token === "string" && config.token.trim().length > 0) {
      return { ok: true, token: config.token.trim(), source: "config" };
    }
  }
  if (options.allowMissing === true) {
    return { ok: true, token: null, source: "anonymous" };
  }
  return {
    ok: false,
    result: failure(
      commandLabel(process.argv.slice(2)),
      3,
      "AUTH_REQUIRED",
      "hosted command requires auth; run signup, set IMAGE_SKILL_TOKEN, or pass --token-stdin",
      false,
      {
        suggested_command: SIGNUP_SUGGESTED_COMMAND,
        docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
      },
    ),
  };
}

async function readConfig(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return {
      ...value,
      tokenPresent:
        typeof value.token === "string" && value.token.trim().length > 0,
    };
  } catch {
    return { token: null, tokenPresent: false };
  }
}

async function saveConfig(value) {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

async function assertConfigWritable(command) {
  const path = configPath();
  const probePath = `${path}.write-test-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(probePath, "", { mode: 0o600 });
    await chmod(probePath, 0o600);
    await rm(probePath, { force: true });
    return { ok: true };
  } catch (error) {
    await rm(probePath, { force: true }).catch(() => {});
    return {
      ok: false,
      result: configWriteFailure(command, error),
    };
  }
}

function configWriteFailure(command, error) {
  const message =
    error instanceof Error
      ? error.message
      : "public CLI could not write its local auth config";
  return failure(
    command,
    9,
    "PUBLIC_CLI_CONFIG_WRITE_FAILED",
    `public CLI could not write auth config at ${configPath()}: ${message}`,
    true,
    {
      suggested_command:
        'IMAGE_SKILL_CONFIG_PATH="$PWD/.image-skill/config.json" image-skill signup --agent --agent-contact AGENT_OR_OPERATOR_INBOX --agent-name NAME --runtime RUNTIME --save --json',
      docs_url: "https://image-skill.com/cli.md#local-config-and-install",
    },
  );
}

function shouldSaveSignupAuth(args) {
  return !flagBool(args, "no-save");
}

function parseArgs(argv) {
  const flags = new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item?.startsWith("--")) {
      const raw = item.slice(2);
      const equalIndex = raw.indexOf("=");
      if (equalIndex !== -1) {
        pushFlag(flags, raw.slice(0, equalIndex), raw.slice(equalIndex + 1));
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        pushFlag(flags, raw, next);
        index += 1;
      } else {
        pushFlag(flags, raw, true);
      }
    } else if (item !== undefined) {
      positionals.push(item);
    }
  }
  return { flags, positionals };
}

function pushFlag(flags, name, value) {
  const values = flags.get(name) ?? [];
  values.push(value);
  flags.set(name, values);
}

function flagString(args, name) {
  const value = args.flags.get(name)?.at(-1);
  return typeof value === "string" ? value : null;
}

function flagStrings(args, name) {
  return (args.flags.get(name) ?? []).filter(
    (value) => typeof value === "string",
  );
}

function flagBool(args, name) {
  return args.flags.has(name) && args.flags.get(name)?.at(-1) !== "false";
}

function rejectPaymentCredentialFlags(args, command) {
  for (const flag of args.flags.keys()) {
    if (PAYMENT_CREDENTIAL_FLAGS.has(flag)) {
      return failure(
        command,
        2,
        "PAYMENT_CREDENTIAL_FLAG_REJECTED",
        `public Image Skill credits commands never accept payment credential flag --${flag}`,
        false,
        {
          docs_url: "https://image-skill.com/cli.md#image-skill-credits-buy",
        },
      );
    }
  }
  return null;
}

function signupContact(args) {
  if (
    args.flags.has("agent-contact") &&
    flagString(args, "agent-contact") === null
  ) {
    return {
      ok: false,
      value: null,
      message: "agent-contact requires a value",
    };
  }
  if (
    args.flags.has("human-email") &&
    flagString(args, "human-email") === null
  ) {
    return {
      ok: false,
      value: null,
      message: "human-email requires a value",
    };
  }
  const agentContact = flagString(args, "agent-contact");
  const humanEmail = flagString(args, "human-email");
  if (agentContact !== null && humanEmail !== null) {
    const normalizedAgentContact = agentContact.trim().toLowerCase();
    const normalizedHumanEmail = humanEmail.trim().toLowerCase();
    if (normalizedAgentContact !== normalizedHumanEmail) {
      return {
        ok: false,
        value: null,
        message:
          "signup received both --agent-contact and --human-email with different values; use one durable contact inbox",
      };
    }
    return { ok: true, value: normalizedAgentContact };
  }
  const value = agentContact ?? humanEmail;
  return {
    ok: true,
    value: value === null ? null : value.trim().toLowerCase(),
  };
}

function flagNumber(args, name) {
  const value = flagString(args, name);
  if (value === null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveIntegerFlag(args, name, input) {
  const value = flagString(args, name);
  if (value === null) {
    return { ok: true, value: null };
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return {
      ok: false,
      result: invalid(input.command, `${name} must be a positive integer`),
    };
  }
  return { ok: true, value: number };
}

function jsonObjectFlag(args, name) {
  const raw = flagString(args, name);
  if (raw === null) {
    return { ok: true, value: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return { ok: true, value: parsed };
    }
  } catch {
    // Fall through to normalized public error.
  }
  return {
    ok: false,
    result: invalid(
      commandLabel(process.argv.slice(2)),
      `--${name} must be a JSON object`,
    ),
  };
}

function csvFlag(args, name, fallback) {
  const value = flagString(args, name);
  return value === null
    ? fallback
    : value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function optionalIdempotencyKey(args, prefix) {
  const value = flagString(args, "idempotency-key");
  if (value !== null) {
    return { value, generated: false };
  }
  return {
    value: `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`,
    generated: true,
  };
}

function requiredIdempotencyKey(args, command, message) {
  const value = flagString(args, "idempotency-key");
  if (value !== null) {
    return { ok: true, value };
  }
  return {
    ok: false,
    result: failure(command, 2, "INVALID_ARGUMENTS", message, false, {
      required_flag: "--idempotency-key",
      suggested_command: `${command} --idempotency-key KEY --json`,
      docs_url: "https://image-skill.com/cli.md#image-skill-credits",
    }),
  };
}

function addQueryFlag(query, args, flag, key) {
  const value = flagString(args, flag);
  if (value !== null) {
    query.set(key, value);
  }
}

function apiBase(args) {
  return (
    flagString(args, "api-base-url") ??
    process.env.IMAGE_SKILL_API_BASE_URL ??
    DEFAULT_API_BASE_URL
  );
}

function configPath() {
  return process.env.IMAGE_SKILL_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

function hasEnvToken() {
  return Boolean(
    process.env.IMAGE_SKILL_TOKEN ?? process.env.IMAGE_SKILL_HOSTED_TOKEN,
  );
}

function success(command, data, warnings = []) {
  return {
    exitCode: 0,
    envelope: {
      ok: true,
      command,
      trace_id: traceId(),
      actor: null,
      data,
      warnings,
      error: null,
    },
  };
}

function invalid(command, message) {
  return failure(command, 2, "INVALID_ARGUMENTS", message, false, {
    docs_url: "https://image-skill.com/cli.md",
  });
}

function withCommand(result, command) {
  return {
    ...result,
    envelope: {
      ...result.envelope,
      command,
    },
  };
}

function failure(command, exitCode, code, message, retryable, recovery) {
  return {
    exitCode,
    envelope: {
      ok: false,
      command,
      trace_id: traceId(),
      actor: null,
      data: null,
      warnings: [],
      error: {
        code,
        message,
        retryable,
        ...(recovery === undefined ? {} : { recovery }),
      },
    },
  };
}

function commandLabel(commandArgv) {
  return commandArgv.length === 0
    ? "image-skill"
    : `image-skill ${commandArgv[0]}`;
}

function traceId() {
  return `trace_${randomBytes(8).toString("hex")}`;
}

function exitCodeForStatus(status) {
  if (status === 401 || status === 403) {
    return 3;
  }
  if (status === 402 || status === 429) {
    return 5;
  }
  if (status >= 500) {
    return 7;
  }
  return 1;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      value += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolvePromise(value));
  });
}

function assetIdFromReference(reference) {
  if (isAssetId(reference)) {
    return reference;
  }
  try {
    const url = new URL(reference);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "media.image-skill.com" ||
      !url.pathname.startsWith("/a/")
    ) {
      return null;
    }
    const candidate = basename(url.pathname).replace(/\.[a-z0-9]+$/i, "");
    return isAssetId(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function isAssetId(value) {
  return /^(?:asset|image|video|audio|mask|thumb|file)_[a-zA-Z0-9._-]{1,128}$/.test(
    value,
  );
}

function deriveAssetGetOutputPath(asset) {
  const urlBasename = safeUsefulUrlBasename(asset.url);
  if (urlBasename !== null) {
    return urlBasename;
  }
  const assetId =
    typeof asset.asset_id === "string" &&
    isSafeDerivedAssetFilename(asset.asset_id)
      ? asset.asset_id
      : (assetIdFromReference(asset.url) ?? "asset");
  return `${assetId}${assetOutputExtension(asset)}`;
}

function safeUsefulUrlBasename(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const rawBasename = basename(url.pathname);
  if (rawBasename.length === 0) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawBasename);
  } catch {
    return null;
  }
  if (!isSafeDerivedAssetFilename(decoded)) {
    return null;
  }
  return extname(decoded).length > 0 ? decoded : null;
}

function isSafeDerivedAssetFilename(value) {
  return (
    value.length > 0 &&
    value.length <= 220 &&
    value !== "." &&
    value !== ".." &&
    !value.startsWith(".") &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
  );
}

function assetOutputExtension(asset) {
  const mimeType =
    typeof asset.mime_type === "string"
      ? asset.mime_type.split(";")[0].trim().toLowerCase()
      : null;
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  if (mimeType === "image/avif") {
    return ".avif";
  }
  return safeUrlExtension(asset.url) ?? "";
}

function safeUrlExtension(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const rawBasename = basename(url.pathname);
  if (rawBasename.length === 0) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawBasename);
  } catch {
    return null;
  }
  const extension = extname(decoded).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

async function downloadUrl(url, outputPath, options) {
  if (!options.overwrite && (await fileExists(outputPath))) {
    return {
      ok: false,
      result: failure(
        "image-skill assets get",
        9,
        "OUTPUT_EXISTS",
        `output path already exists: ${outputPath}`,
        false,
      ),
    };
  }
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    return {
      ok: false,
      result: failure(
        "image-skill assets get",
        7,
        "ASSET_DOWNLOAD_FAILED",
        `asset download failed: HTTP ${response.status}`,
        true,
      ),
    };
  }
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(outputPath),
  );
  const file = await stat(outputPath);
  return {
    ok: true,
    data: {
      output_path: outputPath,
      bytes: file.size,
      content_type: response.headers.get("content-type"),
      content_length_header:
        response.headers.get("content-length") === null
          ? null
          : Number(response.headers.get("content-length")),
      overwritten: options.overwrite,
    },
  };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function mimeFromFilename(filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".gif") {
    return "image/gif";
  }
  if (ext === ".avif") {
    return "image/avif";
  }
  return null;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
