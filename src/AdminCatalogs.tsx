import { FormEvent, type ReactNode, useState } from 'react'
import { Boxes, CarFront, KeyRound, MapPin, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { normalizeProfiles, profileNames } from './access'
import { accountFromPerson, formatQuantity, hashPassword, parseQuantity, type AppData, type Client, type InventoryItem, type Person, type Vehicle } from './store'

type Section = 'pessoas' | 'clientes' | 'veiculos' | 'itens'
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
  const emptyForm = { name: '', email: '', profiles: ['Técnico'], canLogin: true, active: true, provisionalPassword: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [error, setError] = useState('')
  const visible = data.people.filter(item => `${item.name} ${item.email} ${item.groups.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const editing = data.people.find(person => person.id === editingId)
  const editingSelf = editing?.id === data.account.id

  const reset = () => {
    setForm(emptyForm)
    setEditingId('')
    setError('')
  }

  const startEdit = (person: Person) => {
    setEditingId(person.id)
    setForm({ name: person.name, email: person.email, profiles: normalizeProfiles(person.groups), canLogin: person.canLogin, active: person.active, provisionalPassword: '' })
    setError('')
  }

  const toggleProfile = (profile: string) => {
    if (profile === 'Técnico') return
    setForm(current => {
      if (profile === 'Administrador') return { ...current, profiles: current.profiles.includes('Administrador') ? ['Técnico'] : ['Administrador'] }
      const withoutAdmin = current.profiles.filter(item => item !== 'Administrador')
      const profiles = withoutAdmin.includes(profile) ? withoutAdmin.filter(item => item !== profile) : [...withoutAdmin, profile]
      return { ...current, profiles: normalizeProfiles(profiles) }
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const email = form.email.trim().toLowerCase()
    if (form.canLogin && !email) return setError('Informe o e-mail para liberar o acesso à plataforma.')
    if (email && data.people.some(person => person.id !== editingId && person.email.trim().toLowerCase() === email)) return setError('Já existe uma pessoa cadastrada com este e-mail.')
    const needsFirstPassword = form.canLogin && (!editing || !editing.canLogin)
    if (needsFirstPassword && !form.provisionalPassword) return setError('Crie uma senha provisória para o primeiro acesso.')
    if (form.provisionalPassword && (form.provisionalPassword.length < 8 || !/[A-Za-z]/.test(form.provisionalPassword) || !/\d/.test(form.provisionalPassword))) return setError('A senha provisória precisa ter pelo menos 8 caracteres, com letra e número.')

    const passwordHash = form.provisionalPassword ? await hashPassword(form.provisionalPassword) : editing?.passwordHash
    const person: Person = {
      id: editing?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      email,
      groups: editingSelf && normalizeProfiles(editing?.groups).includes('Administrador') ? ['Administrador'] : normalizeProfiles(form.profiles),
      active: editingSelf ? true : form.active,
      canLogin: editingSelf ? true : form.canLogin,
      passwordHash,
      mustChangePassword: form.provisionalPassword ? true : editing?.mustChangePassword,
    }
    const people = editing ? data.people.map(item => item.id === editing.id ? person : item) : [...data.people, person]
    const account = person.id === data.account.id ? accountFromPerson(person, data.account) : data.account
    onChange({ ...data, account, people }, editing ? 'Cadastro atualizado com sucesso.' : 'Pessoa cadastrada com sucesso.')
    reset()
  }

  const remove = (person: Person) => {
    if (person.id === data.account.id) return setError('O usuário conectado não pode excluir o próprio cadastro.')
    if (!window.confirm(`Excluir o cadastro de ${person.name}? Os registros já realizados permanecerão no histórico.`)) return
    onChange({ ...data, people: data.people.filter(item => item.id !== person.id) }, 'Pessoa excluída com sucesso.')
    if (editingId === person.id) reset()
  }

  const formContent = <form className="catalog-form people-form" onSubmit={submit}>
    <label>Nome<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
    <label>E-mail {form.canLogin ? '' : '(opcional)'}<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required={form.canLogin} /></label>
    <fieldset className="profile-selector wide"><legend>Perfis de acesso</legend><p>O acesso de Técnico é a base de todos os demais perfis.</p><div>{profileNames.map(profile => {
      const checked = form.profiles.includes(profile) || (profile === 'Técnico' && !form.profiles.includes('Administrador'))
      return <label className={checked ? 'profile-option selected' : 'profile-option'} key={profile}><input type="checkbox" checked={checked} disabled={profile === 'Técnico' || (editingSelf && normalizeProfiles(editing?.groups).includes('Administrador'))} onChange={() => toggleProfile(profile)} /><span>{profile}</span></label>
    })}</div></fieldset>
    <label className="inline-check"><input type="checkbox" checked={form.canLogin} disabled={editingSelf} onChange={event => setForm({ ...form, canLogin: event.target.checked })} /> Poderá acessar a plataforma</label>
    <label className="inline-check"><input type="checkbox" checked={form.active} disabled={editingSelf} onChange={event => setForm({ ...form, active: event.target.checked })} /> Cadastro ativo</label>
    <label className="wide">{editing ? 'Nova senha provisória (opcional)' : 'Senha provisória'}<div className="password-input-hint"><KeyRound size={16} /><input type="text" value={form.provisionalPassword} onChange={event => setForm({ ...form, provisionalPassword: event.target.value })} required={form.canLogin && !editing} placeholder={editing ? 'Preencha somente para redefinir a senha' : 'Mínimo de 8 caracteres, com letra e número'} /></div><small>{editing ? 'Ao preencher, a senha atual será substituída e a troca será obrigatória no próximo acesso.' : 'A pessoa deverá criar uma nova senha no primeiro acesso.'}</small></label>
    {error && <p className="catalog-form-error wide">{error}</p>}
    <div className="catalog-form-actions wide">{editing && <button type="button" className="secondary-button" onClick={reset}><X size={16} /> Cancelar edição</button>}<button className="primary-button">{editing ? <Pencil size={17} /> : <Plus size={17} />}{editing ? 'Salvar alterações' : 'Adicionar pessoa'}</button></div>
  </form>

  const peopleTable = <div className="responsive-table"><table><thead><tr><th>Pessoa</th><th>E-mail</th><th>Perfis</th><th>Acesso</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visible.length ? visible.map(person => <tr key={person.id}><td><b>{person.name}</b></td><td>{person.email || 'Sem acesso'}</td><td><div className="profile-tags">{normalizeProfiles(person.groups).map(profile => <span key={profile}>{profile}</span>)}</div></td><td>{person.canLogin ? 'Liberado' : 'Sem login'}</td><td><span className={`status ${person.active ? 'success' : 'danger'}`}>{person.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="row-actions"><button className="secondary-button compact" onClick={() => startEdit(person)}><Pencil size={14} /> Editar</button><button className="danger-button compact" disabled={person.id === data.account.id} onClick={() => remove(person)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={6} className="table-empty">Nenhuma pessoa encontrada.</td></tr>}</tbody></table></div>

  return <CatalogLayout title={editing ? `Editar ${editing.name}` : 'Cadastrar pessoa'} form={formContent} table={peopleTable} />
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
    const quantity = parseQuantity(form.quantity)
    const minimum = form.minimum ? parseQuantity(form.minimum) : 0
    if (!Number.isFinite(quantity) || !Number.isFinite(minimum)) return
    const item: InventoryItem = { id: crypto.randomUUID(), ...form, quantity, minimum }
    onChange({ ...data, inventory: [...data.inventory, item] }, 'Item cadastrado no estoque.')
    setForm({ equipment: '', brand: '', model: '', category: 'Insumo', unit: 'Unidade', quantity: '', minimum: '', code: '', notes: '' })
  }
  return <CatalogLayout title="Cadastrar item" form={<form className="catalog-form" onSubmit={submit}><label>Equipamento<input value={form.equipment} onChange={event => setForm({ ...form, equipment: event.target.value })} required /></label><label>Marca (opcional)<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo (opcional)<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label><label>Categoria<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as InventoryItem['category'] })}><option>Insumo</option><option>Ferramenta pessoal</option><option>Ferramenta rotativa</option><option>EPI</option><option>Escada</option></select></label><label>Unidade<select value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value as InventoryItem['unit'] })}><option>Unidade</option><option>Caixa</option><option>Metros</option><option>Rolo</option></select></label><label>Quantidade<input type="text" inputMode="decimal" pattern="-?[0-9]+([,.][0-9]+)?" title="Digite um número inteiro ou decimal, como 2 ou 1,5" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} placeholder="Ex.: 2 ou 1,5" required /></label><label>Estoque mínimo<input type="text" inputMode="decimal" pattern="-?[0-9]+([,.][0-9]+)?" title="Digite um número inteiro ou decimal, como 2 ou 1,5" value={form.minimum} onChange={event => setForm({ ...form, minimum: event.target.value })} placeholder="Ex.: 1 ou 0,5" /></label><label>Código interno (opcional)<input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} /></label><label className="wide">Observação (opcional)<input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button"><Plus size={17} /> Adicionar</button></form>} table={<Table headers={['Equipamento', 'Categoria', 'Unidade', 'Saldo', 'Mínimo', 'Status']} rows={visible.map(item => [item.equipment, item.category, item.unit, formatQuantity(item.quantity), formatQuantity(item.minimum), item.quantity < 0 ? 'Saldo negativo' : item.quantity <= item.minimum ? 'Estoque mínimo' : 'Disponível'])} />} />
}

type CatalogProps = { data: AppData; query: string; onChange: (data: AppData, message: string) => void }
function CatalogLayout({ title, form, table }: { title: string; form: ReactNode; table: ReactNode }) { return <div className="catalog-layout"><section className="surface catalog-form-card"><h3>{title}</h3>{form}</section><section className="surface catalog-table-card">{table}</section></div> }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="responsive-table"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell || '—'}</td>)}</tr>) : <tr><td colSpan={headers.length} className="table-empty">Nenhum cadastro encontrado.</td></tr>}</tbody></table></div> }
function rotationDay(plate: string) { const digit = Number(plate.match(/\d(?=\D*$)/)?.[0]); if ([1, 2].includes(digit)) return 'Segunda-feira'; if ([3, 4].includes(digit)) return 'Terça-feira'; if ([5, 6].includes(digit)) return 'Quarta-feira'; if ([7, 8].includes(digit)) return 'Quinta-feira'; if ([9, 0].includes(digit)) return 'Sexta-feira'; return '—' }
