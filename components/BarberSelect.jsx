const barbers = [
  { id: 1, name: "Eric", img: "/barber1.jpg" },
  { id: 2, name: "Richard", img: "/barber2.jpg" }
];

export default function BarberSelect({ onSelect }) {
  return (
    <div className="barber-grid">
      {barbers.map((barber) => (
        <div key={barber.id} className="barber-card" onClick={() => onSelect(barber)}>
          <img src={barber.img} alt={barber.name} />
          <h4>{barber.name}</h4>
          <span>Barbeiro</span>
        </div>
      ))}
    </div>
  );
}
