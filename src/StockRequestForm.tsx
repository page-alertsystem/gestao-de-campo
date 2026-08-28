import { FormEvent, useState } from 'react'
import { Boxes, ChevronRight, Info, Plus, Trash2, X } from 'lucide-react'
import type { Client, Person } from './store'

type ItemRow = { id: string; equipment: string; brand: string; model: string; quantity: string }
const newRow = (): ItemRow => ({ id: crypto.randomUUID(), equipment: '', brand: '', model: '', quantity: '1' })

export function StockRequestForm({ code, people, clients, onClose, onComplete }: { code: string; people: Person[]; clients: Client[]; onClose: () => void; onComplete: (request: { code: string; technician: string; client: string; items: number }) => void }) {
  const [technician, setTechnician] = useState('')
  const [otherTechnician, setOtherTechnician] = useState('')
  const [client, setClient] = useState('')
  const [otherClient, setOtherClient] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([newRow()])

  const updateRow = (id: string, field: keyof Omit<ItemRow, 'id'>, value: string) => setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row))
  const removeRow = (id: string) => setRows(current => current.length === 1 ? current : current.filter(row => row.id !== id))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onComplete({ code, technician: technician === 'Outros' ? otherTechnician : technician, client: client === 'Outros' ? otherClient : client, items: rows.length })
  }

  return <div className="full-screen-layer request-layer">
    <form className="request-form" onSubmit={submit}>
      <header className="form-page-header"><div><p className="eyebrow">Estoque</p><h2>Nova solicitação</h2><p>Adicione todos os materiais necessários. Um único código acompanhará o pedido inteiro.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></header>
      <main className="request-content">
        <section className="form-section">
          <div className="form-section-title"><span><Boxes size={20} /></span><div><h3>Responsáveis e retirada</h3><p>Informe quem fará a retirada e onde os materiais serão utilizados.</p></div></div>
          <div className="large-form-grid">
            <label>Data prevista para retirada<input type="date" min={new Date().toISOString().slice(0, 10)} required /></label>
            <label>Técnico responsável<select value={technician} onChange={event => setTechnician(event.target.value)} required><option value="">Selecione</option>{people.filter(person => person.active).map(person => <option key={person.id}>{person.name}</option>)}<option value="Outros">Outros</option></select></label>
            {technician === 'Outros' && <label>Nome do técnico<input value={otherTechnician} onChange={event => setOtherTechnician(event.target.value)} placeholder="Nome completo" required /></label>}
            <label>Cliente<select value={client} onChange={event => setClient(event.target.value)} required><option value="">Selecione</option>{clients.filter(item => item.active).map(item => <option key={item.id}>{item.name}</option>)}<option value="Outros">Outros</option></select></label>
            {client === 'Outros' && <label>Nome do cliente<input value={otherClient} onChange={event => setOtherClient(event.target.value)} placeholder="Informe o cliente" required /></label>}
            <label className="full">Observação geral (opcional)<textarea placeholder="Informações importantes para a separação ou retirada." /></label>
          </div>
          {technician === 'Outros' && <div className="info-note"><Info size={17} />Esse nome será incluído no cadastro de técnicos sem e-mail, senha ou acesso à plataforma.</div>}
        </section>

        <section className="form-section">
          <div className="form-section-title"><span><Plus size={20} /></span><div><h3>Itens solicitados</h3><p>Equipamento e quantidade são obrigatórios. Marca e modelo são opcionais.</p></div></div>
          <div className="request-items">{rows.map((row, index) => <article className="request-item" key={row.id}><div className="request-item-heading"><b>Item {index + 1}</b><button type="button" onClick={() => removeRow(row.id)}><Trash2 size={15} /> Remover</button></div><div className="request-row-grid"><label>Equipamento<input value={row.equipment} onChange={event => updateRow(row.id, 'equipment', event.target.value)} placeholder="O que você precisa?" required /></label><label>Marca (opcional)<input value={row.brand} onChange={event => updateRow(row.id, 'brand', event.target.value)} /></label><label>Modelo (opcional)<input value={row.model} onChange={event => updateRow(row.id, 'model', event.target.value)} /></label><label>Quantidade<input type="number" min="0.01" step="0.01" value={row.quantity} onChange={event => updateRow(row.id, 'quantity', event.target.value)} required /></label></div></article>)}</div>
          <button type="button" className="secondary-button" onClick={() => setRows(current => [...current, newRow()])}><Plus size={17} /> Adicionar outro item</button>
        </section>

        <section className="request-code-preview"><span>Código previsto</span><b>{code}</b><small>A sequência definitiva será confirmada quando o pedido for registrado.</small></section>
      </main>
      <footer className="form-page-footer"><p><Info size={17} />O pedido poderá ser editado até entrar em separação.</p><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">Criar solicitação <ChevronRight size={18} /></button></div></footer>
    </form>
  </div>
}
