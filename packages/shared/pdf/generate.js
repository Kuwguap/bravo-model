/**
 * Per-state document generation — returns PDF *bytes* (never writes to disk).
 *
 *   NJ → fills NJ.pdf temp tag + optionally an NJ Temporary Evidence of Insurance.
 *   NY → temp tag on NONNJ.pdf; optionally an NY State Insurance ID Card (FS-20)
 *        with PDF417 barcode.
 *   *  → temp tag on NONNJ.pdf; optionally the NJ-style 30-day coverage card.
 *
 * Callers (dispatch bot, tag-site API) persist the returned bytes to Supabase
 * Storage and/or attach them to Telegram / SendGrid.
 *
 * This is the disk-free refactor of v2/server/lib/pdf/index.js: the branching,
 * field mapping, and insurance-card logic are identical; only the persistence
 * side-effects were removed.
 */

import {
  buildNjTempTagPdf,
  generatePlateNumber,
  generateCarNumber,
  NJ_TEMPLATE_PATH,
  NON_NJ_TEMPLATE_PATH,
} from "./nj-temp-tag.js";
import { buildNjInsuranceCardPdf } from "./nj-insurance-card.js";
import { buildNyInsuranceCardPdf } from "./ny-insurance-card.js";
import {
  formatMakeForPdf,
  formatModelForPdf,
  normalizePdfFields,
} from "./normalize-pdf-fields.js";

function ymd(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function fullName(user) {
  return `${user.firstName || ""} ${user.lastName || ""}`.trim().toUpperCase() || "INSURED PARTY";
}

/**
 * Rotating National Specialty policy number: `ABP63` + 8 digits
 * (e.g. ABP6300166232). Matches the krabinsurancebot / National Specialty
 * Insurance Company numbering used on both NY FS-20 and NJ TEI cards.
 */
export function generateAbpPolicy() {
  const n = Math.floor(Math.random() * 100_000_000);
  return `ABP63${String(n).padStart(8, "0")}`;
}

/**
 * National Specialty carrier block. Carrier code is 169 for NJ residents,
 * 707 for everyone else (non-resident). Serviced by AIPSO-SAIP.
 */
export function nationalSpecialtyCarrier(isNj) {
  return {
    code: isNj ? "169" : "707",
    carrierName: `${isNj ? "169" : "707"} National Specialty Insurance Company`,
    agencyName: "Serviced by AIPSO-SAIP",
    agencyAddressLines: ["PO Box 6400", "Providence, RI 02940-6200"],
  };
}

/**
 * @param {object} args
 * @param {object} args.user   { firstName, lastName }
 * @param {object} args.order  { id, reference, state, address, city, zip, vin,
 *                               year, make, model, color, body,
 *                               insuranceCompany, insurancePolicy, insuranceOptIn,
 *                               paidAt }
 * @param {(state:string) => Promise<{plate:string}>} [args.allocatePlate]
 *        Atomic plate allocator. When omitted, a plate is hashed from the
 *        reference (fine for previews / test mode).
 * @returns {Promise<{
 *   state: string,
 *   tagBytes: Uint8Array,
 *   insuranceBytes?: Uint8Array,
 *   plate: string,
 *   policyNumber?: string,
 *   instructions?: string,
 * }>}
 */
export async function generateDocumentsForOrder({ user, order, allocatePlate }) {
  const state = String(order.state || "").toUpperCase();
  const result = { state };
  const issued = order.paidAt ? new Date(order.paidAt) : new Date();
  const expiry = new Date(issued.getTime() + 30 * 86400000);
  const effDate = ymd(issued);
  const expDate = ymd(expiry);

  const isNj = state === "NJ";
  const carrier = nationalSpecialtyCarrier(isNj);
  // Rotating National Specialty policy (unless the buyer supplied their own).
  const policyNumber = order.insurancePolicy || generateAbpPolicy();
  const insuranceCompany = order.insuranceCompany || "National Specialty Ins";
  const wantInsuranceCard = !!order.insuranceOptIn;

  // Always issue an NJ-style temporary plate, regardless of buyer state.
  // NJ residents get NJ.pdf; everyone else gets NONNJ.pdf.
  const templatePath = state === "NJ" ? NJ_TEMPLATE_PATH : NON_NJ_TEMPLATE_PATH;

  let plate;
  let carNumber;
  if (typeof allocatePlate === "function") {
    const allocated = await allocatePlate(state);
    plate = allocated.plate;
    carNumber = allocated.carNumber; // 10-digit doc number from its own counter
  } else {
    plate = generatePlateNumber(order.reference || order.id);
  }

  const normalized = await normalizePdfFields(order, order.vinHints || {});

  result.tagBytes = await buildNjTempTagPdf({
    templatePath,
    reference: order.reference,
    orderId: order.id,
    plate,
    carNumber,
    vin: order.vin,
    year: normalized.year || order.year,
    make: normalized.make || order.make,
    model: normalized.model || order.model,
    color: normalized.color || order.color,
    body: normalized.body || order.body,
    firstName: user.firstName,
    lastName: user.lastName,
    address: order.address,
    city: order.city,
    state: state || "NJ",
    zip: order.zip,
    insuranceCompany,
    insurancePolicy: policyNumber,
    issuedAt: issued,
    expiresAt: expiry,
  });
  result.plate = plate;

  if (state && state !== "NJ") {
    result.instructions =
      "This is a New Jersey 30-day Temporary Plate. Print it, place it in the rear window, and keep proof of insurance on you while driving.";
  }

  if (wantInsuranceCard) {
    // Non-NJ residents get the barcoded NY-style FS-20 (the PDF417 encodes the
    // driver's license as AAMVA DAQ). NJ residents get the NJ card (no barcode).
    if (!isNj) {
      result.insuranceBytes = await buildNyInsuranceCardPdf({
        policyNumber,
        effectiveMmDdYyyy: effDate,
        expirationMmDdYyyy: expDate,
        issueMmDdYyyy: effDate,
        vehicleYearFull: String(order.year || ""),
        vehicleMakeShort: String(order.make || "").toUpperCase().slice(0, 5),
        vin: String(order.vin || ""),
        insuredNameUpper: fullName(user),
        insuredAddressLines: [
          String(order.address || "").toUpperCase(),
          `${String(order.city || "").toUpperCase()}, ${state || "NY"} ${order.zip || ""}`.trim(),
        ],
        carrierName: carrier.carrierName,
        agencyName: carrier.agencyName,
        agencyAddressLines: carrier.agencyAddressLines,
        issuerCompanyLine: carrier.carrierName,
        issuerPhone: "",
        daq: order.driverLicense || order.reference || order.id,
        agentLicense: "",
      });
    } else {
      result.insuranceBytes = await buildNjInsuranceCardPdf({
        policyNumber,
        effectiveMmDdYyyy: effDate,
        expirationMmDdYyyy: expDate,
        issuedMmDdYyyy: effDate,
        vehicleYear: String(order.year || ""),
        vehicleMake: formatMakeForPdf(order.make),
        vehicleModel: formatModelForPdf(order.model),
        vin: String(order.vin || ""),
        insuredNameUpper: fullName(user),
        insuredAddressLines: [
          String(order.address || "").toUpperCase(),
          `${String(order.city || "").toUpperCase()}, ${state || "NJ"} ${order.zip || ""}`.trim(),
        ],
        carrierName: carrier.carrierName,
        carrierAddressLines: [carrier.agencyName, ...carrier.agencyAddressLines],
        formRevision: "National Specialty · AIPSO-SAIP",
        includeInfoPanel: state === "NJ",
      });
    }
    result.policyNumber = policyNumber;
  }

  return result;
}

export {
  buildNjTempTagPdf,
  generatePlateNumber,
  generateCarNumber,
  NJ_TEMPLATE_PATH,
  NON_NJ_TEMPLATE_PATH,
};
