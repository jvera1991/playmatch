import crypto from "node:crypto";

// Integración con el Web Checkout de Wompi (Colombia).
// Doc oficial: https://docs.wompi.co/docs/colombia/widget-checkout-web/
// La firma de integridad SIEMPRE se genera en el servidor — nunca exponer
// WOMPI_INTEGRITY_SECRET al navegador.
export function buildWompiCheckoutFields(params: {
  reference: string;
  amountInCents: number;
  redirectUrl: string;
}) {
  const currency = "COP";
  const publicKey = process.env.WOMPI_PUBLIC_KEY!;
  const secret = process.env.WOMPI_INTEGRITY_SECRET!;

  const toHash = `${params.reference}${params.amountInCents}${currency}${secret}`;
  const signature = crypto.createHash("sha256").update(toHash).digest("hex");

  return {
    "public-key": publicKey,
    currency,
    "amount-in-cents": String(params.amountInCents),
    reference: params.reference,
    "signature:integrity": signature,
    "redirect-url": params.redirectUrl,
  };
}

export function isWompiConfigured() {
  return Boolean(
    process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET
  );
}
