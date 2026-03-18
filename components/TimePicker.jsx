const hours = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00"
];

export default function TimePicker({ date, onSelect }) {
  return (
    <div>
      <h3>Horarios disponiveis</h3>
      <div className="time-grid">
        {hours.map((time) => (
          <button key={time} className="time-btn" onClick={() => onSelect(time)}>
            {time}
          </button>
        ))}
      </div>
    </div>
  );
}
