export default function GetImagesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6 py-16 text-slate-800">
      <p className="text-xs font-semibold tracking-wide text-cyan-800 uppercase">Aqua Vision · preview check kit</p>
      <h1 className="font-heading text-3xl font-bold text-cyan-950">Download the 35 test images</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        This is a zip file for your laptop, not the live website. Unzip it, then on the preview Upload page select
        all 35 files and tap Analyze.
      </p>
      <ul className="list-disc pl-5 text-sm text-slate-700">
        <li>
          <strong>01-valid-sonar</strong> — 30 side-scan frames the detector already boxed
        </li>
        <li>
          <strong>02-invalid-colour-photos</strong> — 5 colour pictures that should be rejected
        </li>
      </ul>
      <a
        href="/api/download-kit"
        className="inline-flex h-14 items-center justify-center rounded-xl bg-cyan-800 px-6 text-lg font-semibold text-white hover:bg-cyan-900"
      >
        Download zip to this computer
      </a>
      <p className="text-xs text-slate-500">File name: aqua-vision-check-kit.zip · about 3 MB</p>
    </main>
  );
}
