import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { picture } from "../data";
import { Frame } from "./Frame";

// The round's picture, whole and framed: as large as the space allows, never
// past its own 1280x720 (a render scaled up is a blur), the map beside it on
// a wide screen, under it on a narrow one. Larger on a click or F (Esc
// closes: App keeps the keys), drawn over the page from document.body, the
// page under it inert while it is open.
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
  return (
    <>
      <section className="flex min-w-0 flex-col items-center lg:h-full lg:justify-center">
        {/* the frame and the line under it, as wide as the picture */}
        <div className="flex max-w-full flex-col gap-2">
          <Frame className="max-w-full">
            <img
              key={id}
              src={picture(id)}
              width={1280}
              height={720}
              alt="A place somewhere on the two continents"
              className="block aspect-video h-auto w-full max-w-[min(100%,1280px)] animate-fade bg-black lg:max-h-[calc(100dvh-10rem)] lg:w-auto"
            />
            <button
              className="btn-ghost absolute top-3 right-3 size-9 opacity-80 hover:opacity-100"
              onClick={() => setBig(true)}
              aria-label="See it larger"
              title="See it larger (F)"
            >
              <Maximize2 size={16} />
            </button>
          </Frame>
          <p className="flex items-baseline gap-3 px-1">
            <span className="font-display text-xs font-bold tracking-[0.2em] text-gold-300 uppercase">
              Round {round} of {rounds}
            </span>
            <span className="hidden text-xs text-parch-300/60 sm:inline">
              F to see it larger {"\u00b7"} Enter to guess
            </span>
          </p>
        </div>
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
            <Frame className="max-h-full max-w-[min(100%,177vh,1286px)]">
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
