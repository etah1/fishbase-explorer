import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-1 flex-col items-center justify-center gap-6 bg-white px-6 text-center text-black">
      <h1 className="text-4xl font-bold text-black">Cichlid Explorer</h1>
      <p className="max-w-2xl text-black">
        Filter and browse Cichlidae species, sourced live from FishBase.
      </p>
      <div className="flex gap-3">
        <Link
          href="/fish"
          className="rounded-full bg-blue-600 px-6 py-3 text-sm font-medium !text-black hover:bg-blue-700"
        >
          Browse cichlids
        </Link>
        <Link
          href="/tree"
          className="rounded-full border border-blue-200 px-6 py-3 text-sm font-medium !text-black hover:bg-blue-50"
        >
          View phylogeny
        </Link>
      </div>
    </main>
  );
}



