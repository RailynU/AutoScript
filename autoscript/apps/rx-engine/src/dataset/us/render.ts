import { existsSync } from "node:fs";
import type { Rng } from "./rng.js";
import type { GroundTruth } from "./schema.js";

export type RenderStyle = "printed" | "handwritten";
export type RenderDifficulty = "clean" | "noisy";

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1300;

const HAND_FONTS = [
  { path: "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf", family: "RxHand" },
  { path: "/System/Library/Fonts/Supplemental/SnellRoundhand.ttc", family: "RxScript" },
  { path: "/System/Library/Fonts/Supplemental/Chalkduster.ttf", family: "RxChalk" },
];

type Canvas = typeof import("@napi-rs/canvas");
let canvasModule: Canvas | null = null;
let registeredHandFonts: string[] = [];

async function loadCanvas(): Promise<Canvas> {
  if (canvasModule) return canvasModule;
  const mod = await import("@napi-rs/canvas");
  registeredHandFonts = HAND_FONTS.filter((f) => existsSync(f.path) && mod.GlobalFonts.registerFromPath(f.path, f.family)).map((f) => f.family);
  canvasModule = mod;
  return mod;
}

/** Families available for handwriting; empty when none of the macOS fonts exist (falls back to a cursive generic). */
export async function handwritingFonts(): Promise<string[]> {
  await loadCanvas();
  return registeredHandFonts;
}

interface Pen {
  ctx: import("@napi-rs/canvas").SKRSContext2D;
  rng: Rng;
  jitter: number;
}

function text(pen: Pen, s: string, x: number, y: number, font: string, color = "#1b1b1f"): void {
  pen.ctx.font = font;
  pen.ctx.fillStyle = color;
  const dx = pen.jitter ? (pen.rng.next() - 0.5) * pen.jitter : 0;
  const dy = pen.jitter ? (pen.rng.next() - 0.5) * pen.jitter : 0;
  pen.ctx.fillText(s, x + dx, y + dy);
}

function line(pen: Pen, x1: number, y1: number, x2: number, y2: number, color = "#9a9aa3"): void {
  pen.ctx.strokeStyle = color;
  pen.ctx.lineWidth = 1.5;
  pen.ctx.beginPath();
  pen.ctx.moveTo(x1, y1);
  pen.ctx.lineTo(x2, y2);
  pen.ctx.stroke();
}

function medicationLines(m: GroundTruth["medications"][number]): string[] {
  const head = [m.writtenName, m.strength, m.form].filter(Boolean).join(" ");
  const out = [head];
  if (m.sig) out.push(`Sig: ${m.sig}`);
  const tail = [m.quantity ? `Disp: #${m.quantity}` : null, `Refills: ${m.refills}`, m.indication ? `For: ${m.indication}` : null].filter(Boolean).join("    ");
  out.push(tail);
  return out;
}

function signatureScribble(pen: Pen, x: number, y: number, width: number): void {
  pen.ctx.strokeStyle = "#1f2a6b";
  pen.ctx.lineWidth = 2.2;
  pen.ctx.beginPath();
  pen.ctx.moveTo(x, y);
  for (let i = 1; i <= 8; i++) {
    const cx = x + (width / 8) * i;
    pen.ctx.quadraticCurveTo(cx - 20, y + (pen.rng.next() - 0.5) * 40, cx, y + (pen.rng.next() - 0.5) * 14);
  }
  pen.ctx.stroke();
}

function addNoise(pen: Pen, width: number, height: number): void {
  const { ctx, rng } = pen;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(60,50,40,${(rng.next() * 0.25).toFixed(2)})`;
    ctx.fillRect(rng.next() * width, rng.next() * height, rng.int(1, 3), rng.int(1, 3));
  }
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/** Renders a US-style prescription to PNG. The body is typed (printed) or in a handwriting font. */
export async function renderPrescription(gt: GroundTruth, style: RenderStyle, difficulty: RenderDifficulty, rng: Rng): Promise<Buffer> {
  const { createCanvas } = await loadCanvas();
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");
  const noisy = difficulty === "noisy";
  const hand = style === "handwritten";
  const handFamily = registeredHandFonts.length > 0 ? rng.pick(registeredHandFonts) : "cursive";
  const bodyFont = hand ? `30px "${handFamily}"` : "26px Helvetica, Arial, sans-serif";
  const bodyFontSmall = hand ? `26px "${handFamily}"` : "22px Helvetica, Arial, sans-serif";
  const pen: Pen = { ctx, rng, jitter: hand ? 3 : 0 };

  ctx.fillStyle = noisy ? "#f1ebdd" : "#fdfcf8";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (noisy) {
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.rotate(((rng.next() - 0.5) * 3 * Math.PI) / 180);
    ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
  }

  // Letterhead (always printed).
  text(pen, "SYNTHETIC DEMO PRESCRIPTION - NOT A REAL PATIENT OR PRESCRIBER", 60, 48, "bold 16px Helvetica, Arial, sans-serif", "#3b5bdb");
  text(pen, gt.prescriber.clinic, 60, 92, "bold 30px Georgia, serif");
  text(pen, gt.prescriber.street, 60, 122, "20px Helvetica, Arial, sans-serif", "#444");
  text(pen, `${gt.prescriber.cityState}   Tel ${gt.prescriber.phone}`, 60, 148, "20px Helvetica, Arial, sans-serif", "#444");
  if (gt.prescriber.name) text(pen, gt.prescriber.name, 600, 92, "bold 22px Helvetica, Arial, sans-serif");
  text(pen, `NPI ${gt.prescriber.npi}${gt.prescriber.dea ? `   DEA ${gt.prescriber.dea}` : ""}`, 600, 122, "18px Helvetica, Arial, sans-serif", "#444");
  line(pen, 60, 170, CANVAS_WIDTH - 60, 170, "#2b2b33");

  // Patient block.
  text(pen, "Patient:", 60, 215, "bold 20px Helvetica, Arial, sans-serif", "#555");
  text(pen, `${gt.patient.firstName} ${gt.patient.lastName}`, 160, 215, bodyFont);
  text(pen, "DOB:", 600, 215, "bold 20px Helvetica, Arial, sans-serif", "#555");
  text(pen, gt.patient.dateOfBirth ? isoToUs(gt.patient.dateOfBirth) : "", 665, 215, bodyFont);
  text(pen, "Address:", 60, 255, "bold 20px Helvetica, Arial, sans-serif", "#555");
  text(pen, gt.patientAddress, 160, 255, bodyFontSmall);
  text(pen, "Date:", 600, 295, "bold 20px Helvetica, Arial, sans-serif", "#555");
  if (gt.dateAsWritten) text(pen, gt.dateAsWritten, 665, 295, bodyFont);
  else line(pen, 665, 300, 900, 300);
  text(pen, "Allergies:", 60, 295, "bold 20px Helvetica, Arial, sans-serif", "#555");
  if (gt.allergiesOnScript) text(pen, gt.allergiesOnScript, 175, 295, bodyFontSmall);
  line(pen, 60, 320, CANVAS_WIDTH - 60, 320);

  // Rx body.
  text(pen, "Rx", 60, 390, "bold 54px Georgia, serif", "#2b2b33");
  let y = 400;
  for (const m of gt.medications) {
    const lines = medicationLines(m);
    lines.forEach((l, i) => text(pen, l, 150, y + i * 38, i === 0 ? bodyFont : bodyFontSmall));
    y += lines.length * 38 + 30;
  }

  // Footer.
  const footY = Math.max(y + 60, 1080);
  text(pen, "[ ] Dispense as written     [x] Substitution permitted", 60, footY, "20px Helvetica, Arial, sans-serif", "#444");
  line(pen, 560, footY + 70, 920, footY + 70, "#2b2b33");
  text(pen, "Prescriber signature", 560, footY + 95, "16px Helvetica, Arial, sans-serif", "#666");
  if (gt.prescriber.name) signatureScribble(pen, 580, footY + 55, 300);

  if (noisy) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    addNoise(pen, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  return canvas.toBuffer("image/png");
}

export function isoToUs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
