import { AutoDownloadZip } from "./auto-download";

const VALID = [
  "01-aircraft-orig.jpg",
  "02-shipwreck-orig.jpg",
  "03-cylinder-orig.jpg",
  "04-tire-orig.jpg",
  "05-propeller-orig.jpg",
  "06-cylinder-orig.jpg",
  "07-tire-orig.jpg",
  "08-ghost-net-orig.jpg",
  "09-propeller-orig.jpg",
  "10-tire-orig.jpg",
  "11-debris-orig.jpg",
  "12-tire-orig.jpg",
  "13-tire-orig.jpg",
  "14-cylinder-orig.jpg",
  "15-aircraft-flip-h.jpg",
  "16-shipwreck-flip-h.jpg",
  "17-cylinder-flip-h.jpg",
  "18-tire-flip-h.jpg",
  "19-propeller-crop.jpg",
  "20-cylinder-flip-h.jpg",
  "21-tire-flip-h.jpg",
  "22-ghost-net-flip-h.jpg",
  "23-propeller-flip-h.jpg",
  "24-tire-flip-h.jpg",
  "25-debris-flip-h.jpg",
  "26-tire-crop.jpg",
  "27-aircraft-crop.jpg",
  "28-shipwreck-crop.jpg",
  "29-cylinder-crop.jpg",
  "30-tire-crop.jpg",
];

const INVALID = [
  "01-garden-photo.jpg",
  "02-sunset-photo.jpg",
  "03-market-photo.jpg",
  "04-festival-photo.jpg",
  "05-wildlife-photo.jpg",
];

export default function GetImagesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-6 py-12 text-slate-800">
      <AutoDownloadZip />
      <p className="text-xs font-semibold tracking-wide text-cyan-800 uppercase">Aqua Vision · preview check kit</p>
      <h1 className="font-heading text-3xl font-bold text-cyan-950">Saving 35 test images to this computer</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        Your browser should start downloading <strong>aqua-vision-check-kit.zip</strong> now (about 3 MB). If nothing
        happens, tap the button. Unzip it, then on Upload select all 35 files.
      </p>
      <a
        href="/api/download-kit"
        className="inline-flex h-14 items-center justify-center rounded-xl bg-cyan-800 px-6 text-lg font-semibold text-white hover:bg-cyan-900"
      >
        Download zip to this computer
      </a>
      <p className="text-xs text-slate-500">Look in your Downloads folder for aqua-vision-check-kit.zip</p>
      <h2 className="mt-4 text-sm font-semibold text-cyan-950">30 valid sonar (one by one if needed)</h2>
      <ul className="grid max-h-48 grid-cols-1 gap-1 overflow-auto text-sm">
        {VALID.map((name) => (
          <li key={name}>
            <a className="text-cyan-800 underline" href={`/check-kit/01-valid-sonar/${name}`} download>
              {name}
            </a>
          </li>
        ))}
      </ul>
      <h2 className="text-sm font-semibold text-cyan-950">5 invalid colour photos</h2>
      <ul className="grid grid-cols-1 gap-1 text-sm">
        {INVALID.map((name) => (
          <li key={name}>
            <a className="text-cyan-800 underline" href={`/check-kit/02-invalid-colour-photos/${name}`} download>
              {name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
