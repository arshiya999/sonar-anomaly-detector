export default function GetCodePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#082f49] px-6 py-16 text-cyan-50">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-400/30 bg-[#0c4a6e] p-8 shadow-xl">
        <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200/80 uppercase">
          Aqua Vision · SIH 26057
        </p>
        <h1 className="mt-3 font-heading text-3xl font-bold text-white">Download the project</h1>
        <p className="mt-3 text-sm leading-6 text-cyan-100/90">
          Your browser should save <strong>aqua-vision-sih26057.zip</strong> (about 24 MB) automatically.
          If nothing appears, use the button below.
        </p>
        <a
          href="/api/project-zip"
          download="aqua-vision-sih26057.zip"
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-400 text-base font-semibold text-sky-950 hover:bg-amber-300"
        >
          Save zip to this computer
        </a>
        <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-cyan-100/90">
          <li>Unzip the file.</li>
          <li>Install Node.js 20 from nodejs.org if needed.</li>
          <li>
            In the unzipped folder run <code className="rounded bg-black/30 px-1">npm install</code> then{" "}
            <code className="rounded bg-black/30 px-1">npm run dev</code>.
          </li>
          <li>
            Open <code className="rounded bg-black/30 px-1">http://127.0.0.1:47281</code>
          </li>
        </ol>
      </div>
    </main>
  );
}
