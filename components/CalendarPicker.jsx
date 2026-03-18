import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

export default function CalendarPicker({ onSelect }) {
  return (
    <div className="calendar-container">
      <h3>Escolha a data</h3>
      <Calendar onChange={onSelect} />
    </div>
  );
}
