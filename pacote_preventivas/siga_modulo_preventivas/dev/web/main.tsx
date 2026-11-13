// SOMENTE PARA TESTE: monta o menu sobre o harness (login automático com usuário de teste).
import { createRoot } from 'react-dom/client';
import PreventivesModule from '../../src/preventives/PreventivesModule';

async function start() {
  const email = new URLSearchParams(location.search).get('user') || 'servicedesk@teste.local';
  const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'teste123' }) });
  const { token } = await response.json();
  const compact = new URLSearchParams(location.search).has('mobile');
  createRoot(document.getElementById('root')!).render(<PreventivesModule getToken={() => token} compact={compact} />);
}
start();
