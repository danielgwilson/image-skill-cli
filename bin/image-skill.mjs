#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";

const VERSION = "0.1.1";
const DEFAULT_API_BASE_URL = "https://api.image-skill.com";
const DEFAULT_CONFIG_PATH = join(
  process.env.XDG_CONFIG_HOME ?? join(os.homedir(), ".config"),
  "image-skill",
  "config.json",
);

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
        "image-skill <doctor|signup|auth|whoami|usage|quota|credits|models|capabilities|create|upload|edit|assets|jobs|activity|feedback> --json",
      docs_url: "https://image-skill.com/cli.md",
      commands: [
        "doctor",
        "signup --agent --save",
        "auth status",
        "auth save",
        "auth logout",
        "whoami",
        "usage quota",
        "credits packs list",
        "credits quote",
        "credits buy",
        "credits status",
        "models list",
        "models show",
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
        return doctor(rest);
      case "signup":
        return signup(rest);
      case "auth":
        return auth(rest);
      case "whoami":
        return whoami(rest);
      case "usage":
        return usage(rest);
      case "quota":
        return quota(rest);
      case "credits":
        return credits(rest);
      case "models":
        return models(rest);
      case "capabilities":
        return capabilities(rest);
      case "create":
        return create(rest);
      case "upload":
        return upload(rest);
      case "edit":
        return edit(rest);
      case "assets":
        return assets(rest);
      case "jobs":
        return jobs(rest);
      case "activity":
        return activity(rest);
      case "feedback":
        return feedback(rest);
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

async function signup(argv) {
  const args = parseArgs(argv);
  if (!flagBool(args, "agent")) {
    return invalid("image-skill signup", "signup currently requires --agent");
  }
  const humanEmail = flagString(args, "human-email");
  const agentName = flagString(args, "agent-name");
  const runtime = flagString(args, "runtime");
  if (humanEmail === null || agentName === null || runtime === null) {
    return invalid(
      "image-skill signup",
      "signup requires --human-email, --agent-name, and --runtime",
    );
  }
  const save = flagBool(args, "save");
  const showToken = flagBool(args, "show-token");
  const result = await apiRequest({
    command: "image-skill signup",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/agent-signups",
    body: {
      human_email: humanEmail,
      agent_name: agentName,
      runtime,
      return_token: save || showToken,
    },
  });

  const token = result.envelope.data?.token;
  const warnings = [...result.envelope.warnings];
  if (result.envelope.ok && save) {
    if (typeof token !== "string" || token.trim().length === 0) {
      return failure(
        "image-skill signup",
        3,
        "SIGNUP_TOKEN_NOT_RETURNED",
        "signup --save requires a returned hosted token",
        true,
        {
          suggested_command:
            "image-skill signup --agent --human-email EMAIL --agent-name NAME --runtime RUNTIME --save --json",
          docs_url: "https://image-skill.com/cli.md#image-skill-signup-agent",
        },
      );
    }
    await saveConfig({
      api_base_url: apiBase(args),
      token,
      saved_at: new Date().toISOString(),
      actor: result.envelope.actor ?? result.envelope.data?.actor ?? null,
    });
    warnings.push(`saved hosted token to ${configPath()}`);
  }

  if (
    !showToken &&
    result.envelope.data &&
    typeof result.envelope.data === "object"
  ) {
    result.envelope.data = {
      ...result.envelope.data,
      token: null,
      token_presented: false,
      storage: {
        ...(result.envelope.data.storage ?? {}),
        saved: save,
        config_path: save ? configPath() : null,
        reason: save
          ? "public CLI saved token locally with 0600 permissions"
          : "token redacted; rerun with --show-token or --save at signup time",
      },
    };
  }
  result.envelope.warnings = warnings;
  return result;
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
    await saveConfig({
      api_base_url: apiBase(args),
      token: token.token,
      saved_at: new Date().toISOString(),
      actor: null,
    });
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
  if (subcommand !== "quota") {
    return invalid("image-skill usage", "usage requires the quota subcommand");
  }
  return quota(rest);
}

async function quota(argv) {
  const args = parseArgs(argv);
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  return apiRequest({
    command: "image-skill quota",
    method: "GET",
    apiBaseUrl: apiBase(args),
    path: "/v1/quota",
    token: token.token,
  });
}

async function credits(argv) {
  const [subcommand, ...rest] = argv;
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
    const body = {
      ...(creditsValue === null ? {} : { credits: creditsValue }),
      ...(pack === null ? {} : { pack_id: pack }),
      payment_method: flagString(args, "payment-method") ?? "fake",
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
    const provider = flagString(args, "provider");
    if (provider !== "stripe") {
      return invalid(
        "image-skill credits buy",
        "credits buy currently requires --provider stripe",
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
      "credits buy creates or replays a Stripe Checkout attempt and requires --idempotency-key for retry-safe payment mutation",
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
    return result;
  }
  if (subcommand === "fake-purchase") {
    const args = parseArgs(rest);
    const quoteId = flagString(args, "quote-id");
    if (quoteId === null) {
      return invalid(
        "image-skill credits fake-purchase",
        "credits fake-purchase requires --quote-id",
      );
    }
    const token = await resolveToken(args);
    if (!token.ok) {
      return token.result;
    }
    const idempotency = requiredIdempotencyKey(
      args,
      "image-skill credits fake-purchase",
      "credits fake-purchase creates or replays a credit grant and requires --idempotency-key for retry-safe payment mutation",
    );
    if (!idempotency.ok) {
      return idempotency.result;
    }
    const result = await apiRequest({
      command: "image-skill credits fake-purchase",
      method: "POST",
      apiBaseUrl: apiBase(args),
      path: "/v1/credit-purchases",
      token: token.token,
      body: {
        quote_id: quoteId,
        idempotency_key: idempotency.value,
      },
    });
    return result;
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
    return apiRequest({
      command: "image-skill credits status",
      method: "GET",
      apiBaseUrl: apiBase(args),
      path: `/v1/credit-purchases/status?${query.toString()}`,
      token: token.token,
    });
  }
  return invalid(
    "image-skill credits",
    "credits requires packs, quote, buy, status, or fake-purchase",
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
  return apiRequest({
    command:
      subcommand === "list" ? "image-skill models list" : "image-skill models",
    method: "GET",
    apiBaseUrl: apiBase(args),
    path: "/v1/models",
  });
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

async function create(argv) {
  const args = parseArgs(argv);
  const prompt = await promptValue(args);
  if (!prompt.ok) {
    return prompt.result;
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  const modelParameters = jsonObjectFlag(args, "model-parameters-json");
  if (!modelParameters.ok) {
    return modelParameters.result;
  }
  return apiRequest({
    command: "image-skill create",
    method: "POST",
    apiBaseUrl: apiBase(args),
    path: "/v1/create",
    token: token.token,
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
  if (input === undefined) {
    return invalid(
      "image-skill edit",
      "edit requires --input ASSET_ID_OR_PATH_OR_URL",
    );
  }
  const prompt = await promptValue(args);
  if (!prompt.ok) {
    return prompt.result;
  }
  const token = await resolveToken(args);
  if (!token.ok) {
    return token.result;
  }
  const assetId = await resolveInputAssetId(input, args, token.token);
  if (!assetId.ok) {
    return assetId.result;
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
      flagString(args, "output") ?? basename(new URL(asset.url).pathname);
    const downloaded = await downloadUrl(asset.url, output, {
      overwrite: flagBool(args, "overwrite"),
    });
    if (!downloaded.ok) {
      return downloaded.result;
    }
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
  return {
    ok: false,
    result: failure(
      commandLabel(process.argv.slice(2)),
      3,
      "AUTH_REQUIRED",
      "hosted command requires auth; run signup --save, set IMAGE_SKILL_TOKEN, or pass --token-stdin",
      false,
      {
        suggested_command:
          "image-skill signup --agent --human-email EMAIL --agent-name NAME --runtime RUNTIME --save --json",
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

function flagBool(args, name) {
  return args.flags.has(name) && args.flags.get(name)?.at(-1) !== "false";
}

function flagNumber(args, name) {
  const value = flagString(args, name);
  if (value === null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
