import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { picture } from "../data";
import { Frame } from "./Frame";

// The round's picture: the whole scene behind the map on a wide screen (cut
// to fill it), framed above the map on a narrow one, and whole on a click or
// F (Esc closes: App keeps the keys). The whole picture is drawn over the
// page from document.body, the page under it inert while it is open.
export function PicturePanel({
  id,
  round,
  rounds,
  whole: big,
  onWhole: setBig,
}: {
  id: number;
  round: number;
  rounds: number;
  whole: boolean;
  onWhole: (whole: boolean) => void;
}) {
  const label = (
    <span className="font-display text-xs font-bold tracking-[0.2em] text-gold-300 uppercase">
      Round {round} of {rounds}
    </span>
  );
  const enlarge = (
    <button
      className="btn-ghost size-9"
      onClick={() => setBig(true)}
      aria-label="See it whole"
      title="See it whole (F)"
    >
      <Maximize2 size={16} />
    </button>
  );
  return (
    <>
      {/* a wide screen: the scene */}
      <section className="absolute inset-0 hidden overflow-hidden lg:block">
        <img
          key={id}
          src={picture(id)}
          alt="A place somewhere on the two continents"
          className="size-full animate-fade object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.55))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="absolute top-4 left-5 flex items-center gap-3 rounded-[3px] border border-gold-700/70 bg-ink-950/70 px-3 py-1.5 backdrop-blur-sm">
          {label}
          <span className="text-[11px] text-parch-300/60">F to see it whole {"\u00b7"} Enter to guess</span>
        </div>
        <div className="absolute top-4 right-5">{enlarge}</div>
      </section>

      {/* a narrow screen: framed above the map */}
      <section className="flex flex-col gap-2 lg:hidden">
        <Frame>
          <img
            key={id}
            src={picture(id)}
            alt="A place somewhere on the two continents"
            className="aspect-video w-full bg-black object-cover"
          />
          <div className="absolute top-3 right-3">{enlarge}</div>
        </Frame>
        <p className="px-1">{label}</p>
      </section>

      {big &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-10"
            role="dialog"
            aria-modal="true"
            aria-label="The picture, whole"
            onClick={() => setBig(false)}
          >
            <Frame className="max-h-full max-w-[min(100%,177vh)]">
              <img src={picture(id)} alt="" className="max-h-[calc(100vh-5rem)] w-full object-contain" />
            </Frame>
            <button className="btn-ghost absolute top-4 right-4 size-10" aria-label="Close" autoFocus>
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
