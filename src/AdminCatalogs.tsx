import { FormEvent, type ReactNode, useState } from 'react'
import { Boxes, CarFront, MapPin, Plus, Search, Users } from 'lucide-react'
import type { AppData, Client, InventoryItem, Person, Vehicle } from './store'

type Section = 'pessoas' | 'clientes' | 'veiculos' | 'itens'
const groups = ['Técnico de Campo', 'RH', 'Financeiro', 'Logística', 'Estoque', 'Service Desk', 'Implantação', 'Auditor', 'Segurança do Trabalho']

export function AdminCatalogs({ data, onChange }: { data: AppData; onChange: (data: AppData, message: string) => void }) {
  const [section, setSection] = useState<Section>('pessoas')
  const [query, setQuery] = useState('')
  const sections: { id: Section; label: string; count: number; icon: typeof Users }[] = [
    { id: 'pessoas', label: 'Pessoas', count: data.people.length, icon: Users },
    { id: 'clientes', label: 'Clientes', count: data.clients.length, icon: MapPin },
    { id: 'veiculos', label: 'Veículos', count: data.vehicles.length, icon: CarFront },
    { id: 'itens', label: 'Itens do estoque', count: data.inventory.length, icon: Boxes },
  ]

  return <>
    <div className="catalog-tabs">{sections.map(item => { const Icon = item.icon; return <button className={section === item.id ? 'active' : ''} key={item.id} onClick={() => { setSection(item.id); setQuery('') }}><Icon size={18} /><span>{item.label}</span><b>{item.count}</b></button> })}</div>
    <div className="catalog-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar em ${sections.find(item => item.id === section)?.label.toLowerCase()}`} /></label></div>
    {section === 'pessoas' && <PeopleCatalog data={data} query={query} onChange={onChange} />}
    {section === 'clientes' && <ClientCatalog data={data} query={query} onChange={onChange} />}
    {section === 'veiculos' && <VehicleCatalog data={data} query={query} onChange={onChange} />}
    {section === 'itens' && <InventoryCatalog data={data} query={query} onChange={onChange} />}
  </>
}

function PeopleCatalog({ data, query, onChange }: CatalogProps) {
  const [form, setForm] = useState({ name: '', email: '', group: 'Técnico de Campo', canLogin: false })
  const visible = data.people.filter(item => `${item.name} ${item.email} ${item.groups.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const person: Person = { id: crypto.randomUUID(), name: form.name.trim(), email: form.email.trim(), groups: [form.group], active: true, canLogin: form.canLogin }
    onChange({ ...data, people: [...data.people, person] }, 'Pessoa cadastrada com sucesso.')
    setForm({ name: '', email: '', group: 'Técnico de Campo', canLogin: false })
  }
  return <CatalogLayout title="Cadastrar pessoa" form={<form className="catalog-form" onSubmit={submit}><label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>E-mail {form.canLogin ? '' : '(opcional)'}<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required={form.canLogin} /></label><label>Grupo inicial<select value={form.group} onChange={event => setForm({ ...form, group: event.target.value })}>{groups.map(group => <option key={group}>{group}</option>)}</select></label><label className="inline-check"><input type="checkbox" checked={form.canLogin} onChange={event => setForm({ ...form, canLogin: event.target.checked })} /> Poderá acessar a plataforma</label><button className="primary-button"><Plus size={17} /> Adicionar</button></form>} table={<Table headers={['Pessoa', 'E-mail', 'Grupos', 'Acesso', 'Status']} rows={visible.map(item => [item.name, item.email || 'Sem acesso', item.groups.join(', '), item.canLogin ? 'Liberado' : 'Sem login', item.active ? 'Ativo' : 'Inativo'])} />} />
}

function ClientCatalog({ data, query, onChange }: CatalogProps) {
  const [form, setForm] = useState({ name: '', city: '', state: '', latitude: '', longitude: '' })
  const visible = data.clients.filter(item => `${item.name} ${item.city} ${item.state}`.toLowerCase().includes(query.toLowerCase()))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const client: Client = { id: crypto.randomUUID(), ...form, active: true }
    onChange({ ...data, clients: [...data.clients, client] }, 'Cliente cadastrado com sucesso.')
    setForm({ name: '', city: '', state: '', latitude: '', longitude: '' })
  }
  return <CatalogLayout title="Cadastrar cliente" form={<form className="catalog-form" onSubmit={submit}><label>Nome do cliente<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Cidade<input value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} required /></label><label>Estado<input value={form.state} maxLength={2} onChange={event => setForm({ ...form, state: event.target.value.toUpperCase() })} required /></label><label>Latitude<input value={form.latitude} onChange={event => setForm({ ...form, latitude: event.target.value })} required /></label><label>Longitude<input value={form.longitude} onChange={event => setForm({ ...form, longitude: event.target.value })} required /></label><button className="primary-button"><Plus size={17} /> Adicionar</button></form>} table={<Table headers={['Cliente', 'Cidade', 'Estado', 'Coordenadas', 'Status']} rows={visible.map(item => [item.name, item.city, item.state, `${item.latitude}, ${item.longitude}`, item.active ? 'Ativo' : 'Inativo'])} />} />
}

function VehicleCatalog({ data, query, onChange }: CatalogProps) {
  const [form, setForm] = useState({ plate: '', brand: '', model: '', city: '', state: '', mileage: '' })
  const visible = data.vehicles.filter(item => `${item.plate} ${item.brand} ${item.model}`.toLowerCase().includes(query.toLowerCase()))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const vehicle: Vehicle = { id: crypto.randomUUID(), plate: form.plate.toUpperCase(), brand: form.brand, model: form.model, city: form.city, state: form.state.toUpperCase(), mileage: Number(form.mileage), active: true }
    onChange({ ...data, vehicles: [...data.vehicles, vehicle] }, 'Veículo cadastrado com sucesso.')
    setForm({ plate: '', brand: '', model: '', city: '', state: '', mileage: '' })
  }
  return <CatalogLayout title="Cadastrar veículo" form={<form className="catalog-form" onSubmit={submit}><label>Placa<input value={form.plate} maxLength={7} onChange={event => setForm({ ...form, plate: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} required /></label><label>Marca<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} required /></label><label>Modelo<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} required /></label><label>Cidade<input value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} required /></label><label>Estado<input value={form.state} maxLength={2} onChange={event => setForm({ ...form, state: event.target.value.toUpperCase() })} required /></label><label>Quilometragem atual<input type="number" min="0" value={form.mileage} onChange={event => setForm({ ...form, mileage: event.target.value })} required /></label><button className="primary-button"><Plus size={17} /> Adicionar</button></form>} table={<Table headers={['Veículo', 'Placa', 'Cidade/UF', 'KM atual', 'Rodízio']} rows={visible.map(item => [`${item.brand} ${item.model}`, item.plate, `${item.city}/${item.state}`, `${item.mileage.toLocaleString('pt-BR')} km`, rotationDay(item.plate)])} />} />
}

function InventoryCatalog({ data, query, onChange }: CatalogProps) {
  const [form, setForm] = useState({ equipment: '', brand: '', model: '', category: 'Insumo' as InventoryItem['category'], unit: 'Unidade' as InventoryItem['unit'], quantity: '', minimum: '', code: '', notes: '' })
  const visible = data.inventory.filter(item => `${item.equipment} ${item.brand} ${item.model} ${item.category}`.toLowerCase().includes(query.toLowerCase()))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const item: InventoryItem = { id: crypto.randomUUID(), ...form, quantity: Number(form.quantity), minimum: Number(form.minimum || 0) }
    onChange({ ...data, inventory: [...data.inventory, item] }, 'Item cadastrado no estoque.')
    setForm({ equipment: '', brand: '', model: '', category: 'Insumo', unit: 'Unidade', quantity: '', minimum: '', code: '', notes: '' })
  }
  return <CatalogLayout title="Cadastrar item" form={<form className="catalog-form" onSubmit={submit}><label>Equipamento<input value={form.equipment} onChange={event => setForm({ ...form, equipment: event.target.value })} required /></label><label>Marca (opcional)<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo (opcional)<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label><label>Categoria<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as InventoryItem['category'] })}><option>Insumo</option><option>Ferramenta pessoal</option><option>Ferramenta rotativa</option><option>EPI</option><option>Escada</option></select></label><label>Unidade<select value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value as InventoryItem['unit'] })}><option>Unidade</option><option>Caixa</option><option>Metros</option><option>Rolo</option></select></label><label>Quantidade<input type="number" step={form.unit === 'Metros' ? '.01' : '1'} value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} required /></label><label>Estoque mínimo<input type="number" step={form.unit === 'Metros' ? '.01' : '1'} value={form.minimum} onChange={event => setForm({ ...form, minimum: event.target.value })} /></label><label>Código interno (opcional)<input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></label><label className="wide">Observação (opcional)<input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button"><Plus size={17} /> Adicionar</button></form>} table={<Table headers={['Equipamento', 'Categoria', 'Unidade', 'Saldo', 'Mínimo', 'Status']} rows={visible.map(item => [item.equipment, item.category, item.unit, String(item.quantity), String(item.minimum), item.quantity < 0 ? 'Saldo negativo' : item.quantity <= item.minimum ? 'Estoque mínimo' : 'Disponível'])} />} />
}

type CatalogProps = { data: AppData; query: string; onChange: (data: AppData, message: string) => void }
function CatalogLayout({ title, form, table }: { title: string; form: ReactNode; table: ReactNode }) { return <div className="catalog-layout"><section className="surface catalog-form-card"><h3>{title}</h3>{form}</section><section className="surface catalog-table-card">{table}</section></div> }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="responsive-table"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell || '—'}</td>)}</tr>) : <tr><td colSpan={headers.length} className="table-empty">Nenhum cadastro encontrado.</td></tr>}</tbody></table></div> }
function rotationDay(plate: string) { const digit = Number(plate.match(/\d(?=\D*$)/)?.[0]); if ([1, 2].includes(digit)) return 'Segunda-feira'; if ([3, 4].includes(digit)) return 'Terça-feira'; if ([5, 6].includes(digit)) return 'Quarta-feira'; if ([7, 8].includes(digit)) return 'Quinta-feira'; if ([9, 0].includes(digit)) return 'Sexta-feira'; return '—' }
