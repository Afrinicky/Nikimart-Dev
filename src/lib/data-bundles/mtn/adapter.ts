import "server-only";
import type {
  CarrierAdapter,
  CarrierEnvVar,
  CarrierOrderInput,
  CarrierPlacement,
  CarrierStatusRead,
} from "@/lib/data-bundles/carriers/registry";
import { carrierTransactionId } from "@/lib/data-bundles/carriers/rules";
import { mtnConfig, mtnEnvStatus, type MtnConfig } from "@/lib/data-bundles/mtn/config";
import { transferDataBundle, transferStatus, testMtnCredentials } from "@/lib/data-bundles/mtn/client";
import { mapMtnStatus, mtnMessage, mtnValueCharged } from "@/lib/data-bundles/mtn/status";
import { toMtnMsisdn } from "@/lib/data-bundles/mtn/msisdn";

/**
 * MTN as a carrier the rest of the system can use without knowing it is MTN.
 *
 * Everything peculiar to MADAPI stops here: the OAuth2 exchange, the MSISDN
 * format, the two-field status reply, the value-charged unit that is sometimes
 * volume rather than money, and the fact that the correlation id is ours to
 * supply. Above this, an order is handed to a carrier and a result comes back.
 *
 * It is also the worked example for the next two. A Telecel or AirtelTigo
 * adapter has to answer the same questions — which networks, does it need
 * product codes, what does it need configured, place one order, read one
 * status — and nothing else in the system changes when one appears.
 */

function config(): MtnConfig {
  // Read fresh each time rather than captured at module load. It is cheap —
  // reading process.env and a few string trims — and it means a variable added
  // in Vercel takes effect on the next request rather than on the next cold
  // start, which is the difference between "it works now" and "it works, give
  // it twenty minutes".
  return mtnConfig();
}

async function place(input: CarrierOrderInput): Promise<CarrierPlacement> {
  const cfg = config();

  const receiver = toMtnMsisdn(input.recipientPhone, cfg.msisdnFormat);
  if (!receiver) {
    // Nothing was sent, so nothing was spent. Reported as a failed dispatch
    // rather than quietly rerouted: a recipient number this layer cannot read
    // is a problem with the order, and the reseller would reject it too.
    return {
      ok: false,
      message: `${input.recipientPhone} is not a number MTN can credit.`,
      providerOrderId: null,
      providerCode: null,
      providerStatus: null,
      status: "failed",
      charged: null,
    };
  }
  if (!input.productCode) {
    return {
      ok: false,
      message: `No MTN product code is mapped for ${input.sizeGb}GB.`,
      providerOrderId: null,
      providerCode: null,
      providerStatus: null,
      status: "failed",
      charged: null,
    };
  }

  // Derived from the order, never generated fresh here — it is what makes a
  // repeated dispatch safe. See carrierTransactionId.
  const transactionId = carrierTransactionId(input.reference, input.dispatchedAt ?? null);

  const res = await transferDataBundle(cfg, {
    receiverMsisdn: receiver,
    productCode: input.productCode,
    transactionId,
    callbackUrl: cfg.callbackEnabled ? input.callbackUrl : undefined,
  });

  const envelope = res.payload;
  const status = envelope
    ? mapMtnStatus({
        statusCode: envelope.statusCode,
        transactionState: envelope.data?.transactionState,
      })
    : "failed";

  // MTN can answer 200 with a rejecting statusCode — that is a transfer that
  // did not happen, and it must not be stored as one that did.
  if (!res.ok || status === "failed") {
    return {
      ok: false,
      message: res.message,
      providerOrderId: null,
      providerCode: null,
      providerStatus: envelope?.data?.transactionState ?? envelope?.statusCode ?? null,
      status: "failed",
      charged: null,
    };
  }

  return {
    ok: true,
    message: res.message,
    // MADAPI answers about the id we sent, so that id *is* the upstream
    // reference — there is no other one to store.
    providerOrderId: transactionId,
    providerCode: envelope?.data?.productCode ?? input.productCode,
    providerStatus: envelope?.data?.transactionState ?? null,
    status,
    charged: mtnValueCharged(envelope?.data?.valueCharged, envelope?.data?.unit),
  };
}

async function readStatus(providerOrderId: string): Promise<CarrierStatusRead> {
  const cfg = config();
  // Deliberately not gated on `isReady`: an order already sent through MTN
  // still has to be readable after the switch has been turned off again.
  if (!cfg.clientId || !cfg.clientSecret) {
    return {
      ok: false,
      message: "MTN credentials are no longer configured.",
      providerStatus: null,
      status: null,
    };
  }

  const res = await transferStatus(cfg, providerOrderId);
  const envelope = res.payload;
  if (!res.ok || !envelope) {
    return { ok: false, message: res.message, providerStatus: null, status: null };
  }

  return {
    ok: true,
    message: mtnMessage({
      statusCode: envelope.statusCode,
      statusMessage: envelope.statusMessage,
      supportMessage: envelope.supportMessage,
      downstreamStatusCode: envelope.downstreamStatusCode,
      transactionState: envelope.data?.transactionState,
    }),
    providerStatus: envelope.data?.transactionState ?? envelope.statusCode ?? null,
    status: mapMtnStatus({
      statusCode: envelope.statusCode,
      transactionState: envelope.data?.transactionState,
    }),
  };
}

export const mtnAdapter: CarrierAdapter = {
  // Label and networks come from the carrier catalogue, so this adapter and
  // the console cannot disagree about what MTN serves.
  id: "MTN",
  usesProductCodes: true,

  envVars(): CarrierEnvVar[] {
    return mtnEnvStatus();
  },

  readiness() {
    const missing = config().missing;
    return { ready: missing.length === 0, missing };
  },

  place,
  readStatus,

  async test() {
    const cfg = config();
    if (!cfg.clientId || !cfg.clientSecret) {
      return { ok: false, message: "Set MTN_CLIENT_ID and MTN_CLIENT_SECRET in the environment first." };
    }
    const res = await testMtnCredentials(cfg);
    return { ok: res.ok, message: res.message };
  },
};
