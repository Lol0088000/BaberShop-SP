export default function Dashboard() {
  return (
    <div className="admin-dashboard">
      <h1>Painel do Dono</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Agendamentos hoje</h3>
          <p>12</p>
        </div>

        <div className="stat-card">
          <h3>Faturamento hoje</h3>
          <p>R$ 720</p>
        </div>

        <div className="stat-card">
          <h3>Clientes novos</h3>
          <p>5</p>
        </div>
      </div>
    </div>
  );
}
