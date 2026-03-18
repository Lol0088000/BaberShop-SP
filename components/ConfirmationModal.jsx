export default function ConfirmationModal({ barber, date, time }) {
  function confirm() {
    alert("Agendamento confirmado!");
  }

  return (
    <div className="confirm-card">
      <h3>Confirmar Agendamento</h3>
      <p>Barbeiro: {barber.name}</p>
      <p>Data: {date.toLocaleDateString()}</p>
      <p>Horario: {time}</p>

      <button className="btn-primary" onClick={confirm}>
        Confirmar horario
      </button>
    </div>
  );
}
