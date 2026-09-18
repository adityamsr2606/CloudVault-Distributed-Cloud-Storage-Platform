export default function LiveBackdrop() {
  return (
    <div className="live-backdrop" aria-hidden="true">
      <div className="aurora-ribbon aurora-ribbon-a" />
      <div className="aurora-ribbon aurora-ribbon-b" />
      <div className="ambient-sun ambient-sun-a" />
      <div className="ambient-sun ambient-sun-b" />
      <div className="live-contours" />
      <div className="live-grain" />
    </div>
  );
}
