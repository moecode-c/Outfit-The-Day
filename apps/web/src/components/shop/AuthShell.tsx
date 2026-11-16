import { Reveal } from '../Reveal';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[80vh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-wash lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://picsum.photos/seed/otd-auth/1200/1600?grayscale" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/20" />
        <p className="absolute bottom-10 start-10 font-display text-7xl text-white"><em>OTD</em></p>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <Reveal className="w-full max-w-sm">
          <h1 className="mb-12 font-display text-5xl">{title}</h1>
          {children}
        </Reveal>
      </div>
    </div>
  );
}
