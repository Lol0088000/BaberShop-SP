import { useState } from "react";
import BarberSelect from "./BarberSelect";
import CalendarPicker from "./CalendarPicker";
import TimePicker from "./TimePicker";
import ConfirmationModal from "./ConfirmationModal";

export default function AppointmentWidget() {
  const [step, setStep] = useState(1);
  const [barber, setBarber] = useState(null);
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);

  return (
    <div className="booking-widget">
      <h2>Agendar horario</h2>

      {step === 1 && (
        <BarberSelect
          onSelect={(b) => {
            setBarber(b);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <CalendarPicker
          onSelect={(d) => {
            setDate(d);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <TimePicker
          date={date}
          onSelect={(t) => {
            setTime(t);
            setStep(4);
          }}
        />
      )}

      {step === 4 && <ConfirmationModal barber={barber} date={date} time={time} />}
    </div>
  );
}
