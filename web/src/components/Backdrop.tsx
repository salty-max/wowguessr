import { picture } from "../data";

// a picture behind the page (the intro's cover, then the round's), blurred and darkened
export function Backdrop({ id }: { id?: number }) {
  if (id == null) return null;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <img src={picture(id)} alt="" className="size-full scale-110 animate-fade object-cover blur-md" />
      <div className="absolute inset-0 bg-ink-950/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.8))]" />
    </div>
  );
}
