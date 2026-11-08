import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Camera, Download, Heart, Pause, Play, RefreshCw, X } from "lucide-react";
import { fetchInvite } from "../lib/api";
import { decodeThanks, guestGreeting, PersonalThanks } from "./personalization";
import photos from "./photos.json";
import "./thank-you.css";

export default function ThankYouPage({ token }: { token: string }) {
  const [guest, setGuest] = useState<PersonalThanks | null>(null);
  const [personalStatus, setPersonalStatus] = useState(token ? "loading" : "general");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastPhotoButton = useRef<HTMLElement | null>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGuest(null);
    if (!token) { setPersonalStatus("general"); return; }
    setPersonalStatus("loading");
    (async () => {
      try {
        const response = await fetch("./thank-you-guests.json");
        if (!response.ok) throw Error("Couldn't load your note.");
        let personal = await decodeThanks(token, await response.json());
        if (!personal) {
          const result = await fetchInvite(token);
          if (!result.ok) throw Error("Personal link not found.");
          personal = { name: result.invite.primaryName, partnerName: result.invite.partnerName, gift: false, attended: result.invite.lastResponse?.status === "yes" };
        }
        if (!cancelled) { setGuest(personal); setPersonalStatus("ready"); }
      } catch { if (!cancelled) setPersonalStatus("error"); }
    })();
    return () => { cancelled = true; };
  }, [token, retry]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); } }), { threshold: 0.06 });
    document.querySelectorAll(".thanks-reveal").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [showAll]);

  function step(direction: number) { setPhotoReady(false); setActive((current) => current === null ? null : (current + direction + photos.length) % photos.length); }
  function openPhoto(index: number, slideshow = false) {
    lastPhotoButton.current = document.activeElement as HTMLElement;
    setPhotoReady(false); setActive(index); setPlaying(slideshow);
  }
  function closeGallery() { setPlaying(false); setActive(null); }

  useEffect(() => {
    if (active === null) return;
    const modal = dialog.current;
    modal?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { modal?.close(); document.body.style.overflow = before; lastPhotoButton.current?.focus({ preventScroll: true }); };
  }, [active !== null]);

  useEffect(() => {
    if (active === null || !playing || !photoReady) return;
    const timer = window.setInterval(() => { if (!document.hidden) step(1); }, 5000);
    return () => window.clearInterval(timer);
  }, [active, playing, photoReady]);

  useEffect(() => {
    if (active === null) return;
    const next = new Image(); next.src = photos[(active + 1) % photos.length].src;
  }, [active]);

  const visiblePhotos = showAll ? photos : photos.slice(0, 12);
  const photo = active === null ? null : photos[active];
  return <div className="thanks-page">
    <header className="thanks-hero">
      <img className="thanks-hero-photo" src="./wedding/memory-04.webp" alt="Sunyoung and Eric sharing a kiss at their wedding" fetchPriority="high" />
      <div className="thanks-hero-shade" />
      <nav className="thanks-topline" aria-label="Wedding memories"><a href={token ? `#invite=${encodeURIComponent(token)}` : "./"} className="thanks-wordmark">Sunyoung &amp; Eric</a><span>Married · October 30, 2026</span></nav>
      <div className="thanks-hero-copy"><span className="thanks-eyebrow">{guest ? `For ${guestGreeting(guest)}, with love` : "Our favourite night. Our favourite people."}</span><h1>A very big<br /><em>thank you.</em></h1><p>For the love, the laughter,<br />and a night we'll never forget.</p><a className="thanks-photo-link" href="#memories" onClick={(event) => { event.preventDefault(); document.getElementById("memories")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}><span>Relive the evening</span><ArrowDown size={18} /></a></div>
      <span className="thanks-hero-footnote">The Loft · Hamilton</span>
    </header>

    <section className="thanks-letter" aria-labelledby="thanks-dear">
      <div className="thanks-letter-mark" aria-hidden="true"><Heart size={24} strokeWidth={1.2} /></div>
      <p className="thanks-eyebrow">A little note from the newlyweds</p>
      <h2 id="thanks-dear">{guest ? `Dear ${guestGreeting(guest)},` : "To our wonderful people,"}</h2>
      {personalStatus === "loading" && <p className="thanks-personal-loading" role="status">Opening your personal note<span aria-hidden="true">...</span></p>}
      <p>{guest?.attended || !guest ? "Our wedding wouldn't have been the same without the people who filled it with love. Thank you for celebrating with us, for showing up with such wonderful energy, and for making the whole evening feel like us." : "Thank you for being part of our lives and for all the love around our wedding. Whether near or far, having you in our corner means more than we can say."}</p>
      <p>We're still smiling about the music, the dancing, the happy chaos, and all those little moments in between. More than anything, we're grateful to have such lovely people to share this chapter with.</p>
      {guest?.gift && <div className="thanks-gift" data-testid="gift-thanks"><Heart size={20} aria-hidden="true" /><p>And an extra thank-you for your thoughtful gift. Your kindness and generosity mean so much to us. We're truly grateful for the gift, and even more grateful for you.</p></div>}
      {personalStatus === "error" && <p className="thanks-personal-error">Your personal note couldn't open just now. The photos are still here for you.<button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} /> Try your note again</button></p>}
      <p className="thanks-signoff">With all our love,<span>Sunyoung &amp; Eric</span><Heart size={16} fill="currentColor" aria-hidden="true" /></p>
    </section>

    <section className="thanks-memories" id="memories" aria-labelledby="memories-title">
      <header className="thanks-gallery-heading thanks-reveal"><div><p className="thanks-eyebrow">The good bits, all over again</p><h2 id="memories-title">One night.<br /><em>So many happy memories.</em></h2></div><button className="thanks-slideshow" type="button" onClick={() => openPhoto(0, true)}><Play size={17} fill="currentColor" /> Play the evening</button></header>
      <div className="thanks-gallery">{visiblePhotos.map((item, index) => <button className="thanks-photo thanks-reveal" type="button" key={item.id} onClick={() => openPhoto(index)} aria-label={`Open wedding photo ${index + 1} of ${photos.length}`} style={{ "--photo-ratio": `${item.width} / ${item.height}`, "--photo-delay": `${index % 3 * 70}ms` } as React.CSSProperties}><img src={item.thumb} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" /><span className="thanks-photo-number">{String(index + 1).padStart(2, "0")} <Camera size={16} /></span></button>)}</div>
      {!showAll && photos.length > 12 && <button className="thanks-more" type="button" onClick={() => setShowAll(true)}>More memories <span>{photos.length - 12}</span><ArrowDown size={16} /></button>}
      <p className="thanks-gallery-end">A room full of love. A lifetime to remember it.</p>
    </section>

    <footer className="thanks-footer"><Heart size={22} strokeWidth={1.2} aria-hidden="true" /><h2>Here's to everything<br /><em>that comes next.</em></h2><p>So much love, Sunyoung &amp; Eric</p><span>October 30, 2026 · Hamilton, Ontario</span></footer>

    <dialog ref={dialog} className="thanks-lightbox" aria-label="Wedding photo gallery" onCancel={closeGallery} onClick={(event) => { if (event.target === event.currentTarget) closeGallery(); }} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); step(1); } if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); } }}>
      {photo && <div className="thanks-lightbox-inner"><header><span>{active! + 1} / {photos.length}</span><div><button type="button" aria-label={playing ? "Pause slideshow" : "Play slideshow"} title={playing ? "Pause slideshow" : "Play slideshow"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={21} /> : <Play size={21} />}</button><a href={photo.src} download={`Sunyoung-Eric-${photo.id}.webp`} aria-label="Download this photo" title="Download this photo"><Download size={21} /></a><button className="thanks-close" type="button" autoFocus aria-label="Close gallery" title="Close gallery" onClick={closeGallery}><X size={24} /></button></div></header><div className="thanks-lightbox-photo" onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={(event) => { if (touchStart.current !== null) { const distance = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(distance) > 50) step(distance > 0 ? -1 : 1); } touchStart.current = null; }}><img key={photo.id} src={photo.src} alt={photo.alt} onLoad={() => setPhotoReady(true)} onError={() => setPhotoReady(true)} /></div><footer><button type="button" aria-label="Previous photo" title="Previous photo" onClick={() => step(-1)}><ArrowLeft size={23} /></button><span>Sunyoung &amp; Eric · October 30</span><button type="button" aria-label="Next photo" title="Next photo" onClick={() => step(1)}><ArrowRight size={23} /></button></footer></div>}
    </dialog>
  </div>;
}
