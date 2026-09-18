export default function LiveBackdrop() {
  return (
    <div className="live-backdrop" aria-hidden="true">
      <div className="live-orb live-orb-a" />
      <div className="live-orb live-orb-b" />
      <div className="live-orb live-orb-c" />
      <div className="live-grid" />
      <div className="live-noise" />
    </div>
  );
}
