import { FormEvent, type ReactNode, useState } from 'react'
import { CarFront, KeyRound, ListChecks, MapPin, Pencil, Plus, Search, Trash2, Users, Wrench, X } from 'lucide-react'
import { normalizeProfiles, profileNames } from './access'
import { accountFromPerson, hashPassword, type AppData, type Client, type EquipmentCategory, type EquipmentType, type InventoryItem, type Person, type Vehicle } from './store'
import { personalInventory } from './personalInventory'

type Section = 'pessoas' | 'clientes' | 'veiculos' | 'rotativas' | 'categorias'
export function AdminCatalogs({ data, onChange }: { data: AppData; onChange: (data: AppData, message: string) => void }) {
  const [section, setSection] = useState<Section>('pessoas')
  const [query, setQuery] = useState('')
  const sections: { id: Section; label: string; count: number; icon: typeof Users }[] = [
    { id: 'pessoas', label: 'Pessoas', count: data.people.length, icon: Users },
    { id: 'clientes', label: 'Clientes', count: data.clients.length, icon: MapPin },
    { id: 'veiculos', label: 'Veículos', count: data.vehicles.length, icon: CarFront },
    { id: 'rotativas', label: 'Ferramentas rotativas', count: data.inventory.filter(item => item.category === 'Ferramenta rotativa').length, icon: Wrench },
    { id: 'categorias', label: 'Categorias', count: data.equipmentCategories.length, icon: ListChecks },
  ]

  return <>
    <div className="catalog-tabs">{sections.map(item => { const Icon = item.icon; return <button className={section === item.id ? 'active' : ''} key={item.id} onClick={() => { setSection(item.id); setQuery('') }}><Icon size={18} /><span>{item.label}</span><b>{item.count}</b></button> })}</div>
    <div className="catalog-toolbar"><label className="search-field"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar em ${sections.find(item => item.id === section)?.label.toLowerCase()}`} /></label></div>
    {section === 'pessoas' && <PeopleCatalog data={data} query={query} onChange={onChange} />}
    {section === 'clientes' && <ClientCatalog data={data} query={query} onChange={onChange} />}
    {section === 'veiculos' && <VehicleCatalog data={data} query={query} onChange={onChange} />}
    {section === 'rotativas' && <RotatingToolCatalog data={data} query={query} onChange={onChange} />}
    {section === 'categorias' && <EquipmentCategoryCatalog data={data} query={query} onChange={onChange} />}
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
  const [editingId, setEditingId] = useState('')
  const visible = data.clients.filter(item => `${item.name} ${item.city} ${item.state}`.toLowerCase().includes(query.toLowerCase()))
  const reset = () => { setForm({ name: '', city: '', state: '', latitude: '', longitude: '' }); setEditingId('') }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const previous = data.clients.find(item => item.id === editingId)
    const client: Client = { id: previous?.id ?? crypto.randomUUID(), ...form, active: previous?.active ?? true }
    onChange({ ...data, clients: previous ? data.clients.map(item => item.id === previous.id ? client : item) : [...data.clients, client] }, previous ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.')
    reset()
  }
  const edit = (item: Client) => { setEditingId(item.id); setForm({ name: item.name, city: item.city, state: item.state, latitude: item.latitude, longitude: item.longitude }) }
  const remove = (item: Client) => { if (!window.confirm(`Excluir o cliente ${item.name}?`)) return; onChange({ ...data, clients: data.clients.filter(entry => entry.id !== item.id) }, 'Cliente excluído.'); if (editingId === item.id) reset() }
  return <CatalogLayout title={editingId ? 'Editar cliente' : 'Cadastrar cliente'} form={<form className="catalog-form" onSubmit={submit}><label>Nome do cliente<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label>Cidade<input value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} required /></label><label>Estado<input value={form.state} maxLength={2} onChange={event => setForm({ ...form, state: event.target.value.toUpperCase() })} required /></label><label>Latitude<input value={form.latitude} onChange={event => setForm({ ...form, latitude: event.target.value })} required /></label><label>Longitude<input value={form.longitude} onChange={event => setForm({ ...form, longitude: event.target.value })} required /></label><div className="catalog-form-actions wide">{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={16} /> Cancelar</button>}<button className="primary-button">{editingId ? <Pencil size={17} /> : <Plus size={17} />}{editingId ? 'Salvar' : 'Adicionar'}</button></div></form>} table={<div className="responsive-table"><table><thead><tr><th>Cliente</th><th>Cidade/UF</th><th>Coordenadas</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visible.length ? visible.map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.city}/{item.state}</td><td>{item.latitude}, {item.longitude}</td><td><span className={`status ${item.active ? 'success' : 'danger'}`}>{item.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="row-actions"><button className="secondary-button compact" onClick={() => edit(item)}><Pencil size={14} /> Editar</button><button className="danger-button compact" onClick={() => remove(item)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={5} className="table-empty">Nenhum cliente encontrado.</td></tr>}</tbody></table></div>} />
}

function VehicleCatalog({ data, query, onChange }: CatalogProps) {
  const [form, setForm] = useState({ plate: '', brand: '', model: '', city: '', state: '', mileage: '' })
  const [editingId, setEditingId] = useState('')
  const visible = data.vehicles.filter(item => `${item.plate} ${item.brand} ${item.model}`.toLowerCase().includes(query.toLowerCase()))
  const reset = () => { setForm({ plate: '', brand: '', model: '', city: '', state: '', mileage: '' }); setEditingId('') }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const previous = data.vehicles.find(item => item.id === editingId)
    const vehicle: Vehicle = { id: previous?.id ?? crypto.randomUUID(), plate: form.plate.toUpperCase(), brand: form.brand, model: form.model, city: form.city, state: form.state.toUpperCase(), mileage: Number(form.mileage), active: previous?.active ?? true }
    onChange({ ...data, vehicles: previous ? data.vehicles.map(item => item.id === previous.id ? vehicle : item) : [...data.vehicles, vehicle] }, previous ? 'Veículo atualizado com sucesso.' : 'Veículo cadastrado com sucesso.')
    reset()
  }
  const edit = (item: Vehicle) => { setEditingId(item.id); setForm({ plate: item.plate, brand: item.brand, model: item.model, city: item.city, state: item.state, mileage: String(item.mileage) }) }
  const remove = (item: Vehicle) => { if (!window.confirm(`Excluir o veículo ${item.plate}?`)) return; onChange({ ...data, vehicles: data.vehicles.filter(entry => entry.id !== item.id) }, 'Veículo excluído.'); if (editingId === item.id) reset() }
  return <CatalogLayout title={editingId ? 'Editar veículo' : 'Cadastrar veículo'} form={<form className="catalog-form" onSubmit={submit}><label>Placa<input value={form.plate} maxLength={7} onChange={event => setForm({ ...form, plate: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} required /></label><label>Marca<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} required /></label><label>Modelo<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} required /></label><label>Cidade<input value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} required /></label><label>Estado<input value={form.state} maxLength={2} onChange={event => setForm({ ...form, state: event.target.value.toUpperCase() })} required /></label><label>Quilometragem atual<input type="number" min="0" value={form.mileage} onChange={event => setForm({ ...form, mileage: event.target.value })} required /></label><div className="catalog-form-actions wide">{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={16} /> Cancelar</button>}<button className="primary-button">{editingId ? <Pencil size={17} /> : <Plus size={17} />}{editingId ? 'Salvar' : 'Adicionar'}</button></div></form>} table={<div className="responsive-table"><table><thead><tr><th>Veículo</th><th>Placa</th><th>Cidade/UF</th><th>KM atual</th><th>Rodízio</th><th>Ações</th></tr></thead><tbody>{visible.length ? visible.map(item => <tr key={item.id}><td><b>{item.brand} {item.model}</b></td><td>{item.plate}</td><td>{item.city}/{item.state}</td><td>{item.mileage.toLocaleString('pt-BR')} km</td><td>{rotationDay(item.plate)}</td><td><div className="row-actions"><button className="secondary-button compact" onClick={() => edit(item)}><Pencil size={14} /> Editar</button><button className="danger-button compact" onClick={() => remove(item)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={6} className="table-empty">Nenhum veículo encontrado.</td></tr>}</tbody></table></div>} />
}

function RotatingToolCatalog({ data, query, onChange }: CatalogProps) {
  const emptyForm = { equipment: '', brand: '', model: '', code: '', serialNumber: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const visible = data.inventory.filter(item => item.category === 'Ferramenta rotativa' && `${item.equipment} ${item.brand} ${item.model} ${item.code}`.toLowerCase().includes(query.toLowerCase()))
  const holder = (item: InventoryItem) => data.people.find(person => personalInventory(data, person.id).some(entry => entry.id === item.id))
  const reset = () => { setForm(emptyForm); setEditingId('') }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedCode = form.code.trim().toLocaleUpperCase('pt-BR')
    if (data.inventory.some(item => item.id !== editingId && item.code.trim().toLocaleUpperCase('pt-BR') === normalizedCode)) return
    const previous = data.inventory.find(item => item.id === editingId)
    const item: InventoryItem = { id: previous?.id ?? crypto.randomUUID(), equipment: form.equipment.trim(), brand: form.brand.trim(), model: form.model.trim(), category: 'Ferramenta rotativa', equipmentCategoryId: previous?.equipmentCategoryId, unit: 'Unidade', quantity: 1, minimum: 0, code: normalizedCode, serialNumber: form.serialNumber.trim(), notes: form.notes.trim() }
    const inventory = previous ? data.inventory.map(entry => entry.id === previous.id ? item : entry) : [...data.inventory, item]
    const stockAssignments = previous ? data.stockAssignments.map(entry => entry.inventoryItemId === previous.id ? { ...entry, equipment: item.equipment, brand: item.brand, model: item.model, code: item.code, serialNumber: item.serialNumber } : entry) : data.stockAssignments
    onChange({ ...data, inventory, stockAssignments }, previous ? 'Ferramenta rotativa atualizada.' : 'Ferramenta rotativa cadastrada individualmente.')
    reset()
  }
  const edit = (item: InventoryItem) => { setEditingId(item.id); setForm({ equipment: item.equipment, brand: item.brand, model: item.model, code: item.code, serialNumber: item.serialNumber || '', notes: item.notes }) }
  const remove = (item: InventoryItem) => { if (!window.confirm(`Excluir a ferramenta rotativa ${item.equipment} (${item.code})?`)) return; onChange({ ...data, inventory: data.inventory.filter(entry => entry.id !== item.id), stockAssignments: data.stockAssignments.filter(entry => entry.inventoryItemId !== item.id) }, 'Ferramenta rotativa excluída.'); if (editingId === item.id) reset() }
  const duplicated = Boolean(form.code.trim() && data.inventory.some(item => item.id !== editingId && item.code.trim().toLocaleUpperCase('pt-BR') === form.code.trim().toLocaleUpperCase('pt-BR')))
  return <CatalogLayout title={editingId ? 'Editar ferramenta rotativa' : 'Cadastrar ferramenta rotativa'} form={<form className="catalog-form" onSubmit={submit}><label>Equipamento<input value={form.equipment} onChange={event => setForm({ ...form, equipment: event.target.value })} required /></label><label>Fabricante<input value={form.brand} onChange={event => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label><label>Código individual<input value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toLocaleUpperCase('pt-BR') })} required /></label><label>Número de série (opcional)<input value={form.serialNumber} onChange={event => setForm({ ...form, serialNumber: event.target.value })} /></label><label className="wide">Observações (opcional)<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>{duplicated && <p className="catalog-form-error wide">Já existe uma ferramenta com este código individual.</p>}<div className="catalog-form-actions wide">{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={16} /> Cancelar</button>}<button className="primary-button" disabled={duplicated}>{editingId ? <Pencil size={17} /> : <Plus size={17} />}{editingId ? 'Salvar' : 'Adicionar uma ferramenta'}</button></div></form>} table={<div className="responsive-table"><table><thead><tr><th>Equipamento</th><th>Modelo</th><th>Fabricante</th><th>Código</th><th>Responsável</th><th>Ações</th></tr></thead><tbody>{visible.length ? visible.map(item => <tr key={item.id}><td><b>{item.equipment}</b></td><td>{item.model || '—'}</td><td>{item.brand || '—'}</td><td>{item.code}</td><td>{holder(item)?.name ?? 'Estoque'}</td><td><div className="row-actions"><button className="secondary-button compact" onClick={() => edit(item)}><Pencil size={14} /> Editar</button><button className="danger-button compact" onClick={() => remove(item)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={6} className="table-empty">Nenhuma ferramenta rotativa cadastrada.</td></tr>}</tbody></table></div>} />
}

function EquipmentCategoryCatalog({ data, query, onChange }: CatalogProps) {
  const emptyForm = { name: '', type: 'Ferramenta' as EquipmentType, questions: [''] }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const visible = data.equipmentCategories.filter(item => `${item.name} ${item.type}`.toLowerCase().includes(query.toLowerCase()))
  const reset = () => { setForm({ ...emptyForm, questions: [''] }); setEditingId('') }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const questions = form.questions.map(question => question.trim()).filter(Boolean).slice(0, 10)
    if (!form.name.trim() || !questions.length) return
    const previous = data.equipmentCategories.find(item => item.id === editingId)
    const category: EquipmentCategory = { id: previous?.id ?? crypto.randomUUID(), name: form.name.trim(), type: form.type, questions, active: true }
    onChange({ ...data, equipmentCategories: previous ? data.equipmentCategories.map(item => item.id === previous.id ? category : item) : [...data.equipmentCategories, category] }, previous ? 'Categoria atualizada.' : 'Categoria cadastrada com checklist de auditoria.')
    reset()
  }
  const edit = (item: EquipmentCategory) => { setEditingId(item.id); setForm({ name: item.name, type: item.type, questions: item.questions.length ? [...item.questions] : [''] }) }
  const remove = (item: EquipmentCategory) => {
    if (!window.confirm(`Excluir a categoria ${item.name}? Os equipamentos vinculados ficarão sem categoria.`)) return
    onChange({ ...data, equipmentCategories: data.equipmentCategories.filter(entry => entry.id !== item.id), inventory: data.inventory.map(entry => entry.equipmentCategoryId === item.id ? { ...entry, equipmentCategoryId: undefined } : entry), stockAssignments: data.stockAssignments.map(entry => entry.equipmentCategoryId === item.id ? { ...entry, equipmentCategoryId: undefined } : entry) }, 'Categoria excluída.')
    if (editingId === item.id) reset()
  }
  const setQuestion = (index: number, value: string) => setForm(current => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? value : question) }))
  const removeQuestion = (index: number) => setForm(current => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))
  return <CatalogLayout title={editingId ? 'Editar categoria' : 'Cadastrar categoria'} form={<form className="catalog-form category-form" onSubmit={submit}><label>Tipo<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as EquipmentType })}><option>Ferramenta</option><option>EPI</option></select></label><label>Nome da categoria<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Capacete" required /></label><fieldset className="wide category-questions"><legend>Perguntas da auditoria</legend><p>Cadastre até 10 perguntas. Na auditoria as respostas serão Conforme, Não conforme ou Não aplicável.</p>{form.questions.map((question, index) => <div key={index}><span>{index + 1}</span><input value={question} onChange={event => setQuestion(index, event.target.value)} placeholder="Digite a pergunta" required /><button type="button" className="icon-button" disabled={form.questions.length === 1} onClick={() => removeQuestion(index)} aria-label="Remover pergunta"><Trash2 size={15} /></button></div>)}<button type="button" className="secondary-button compact" disabled={form.questions.length >= 10} onClick={() => setForm(current => ({ ...current, questions: [...current.questions, ''] }))}><Plus size={15} /> Adicionar pergunta</button></fieldset><div className="catalog-form-actions wide">{editingId && <button type="button" className="secondary-button" onClick={reset}><X size={16} /> Cancelar</button>}<button className="primary-button">{editingId ? <Pencil size={17} /> : <Plus size={17} />}{editingId ? 'Salvar categoria' : 'Cadastrar categoria'}</button></div></form>} table={<div className="responsive-table"><table><thead><tr><th>Categoria</th><th>Tipo</th><th>Perguntas</th><th>Ações</th></tr></thead><tbody>{visible.length ? visible.map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.type}</td><td>{item.questions.length} de 10</td><td><div className="row-actions"><button className="secondary-button compact" onClick={() => edit(item)}><Pencil size={14} /> Editar</button><button className="danger-button compact" onClick={() => remove(item)}><Trash2 size={14} /> Excluir</button></div></td></tr>) : <tr><td colSpan={4} className="table-empty">Nenhuma categoria encontrada.</td></tr>}</tbody></table></div>} />
}

type CatalogProps = { data: AppData; query: string; onChange: (data: AppData, message: string) => void }
function CatalogLayout({ title, form, table }: { title: string; form: ReactNode; table: ReactNode }) { return <div className="catalog-layout"><section className="surface catalog-form-card"><h3>{title}</h3>{form}</section><section className="surface catalog-table-card">{table}</section></div> }
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="responsive-table"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell || '—'}</td>)}</tr>) : <tr><td colSpan={headers.length} className="table-empty">Nenhum cadastro encontrado.</td></tr>}</tbody></table></div> }
function rotationDay(plate: string) { const digit = Number(plate.match(/\d(?=\D*$)/)?.[0]); if ([1, 2].includes(digit)) return 'Segunda-feira'; if ([3, 4].includes(digit)) return 'Terça-feira'; if ([5, 6].includes(digit)) return 'Quarta-feira'; if ([7, 8].includes(digit)) return 'Quinta-feira'; if ([9, 0].includes(digit)) return 'Sexta-feira'; return '—' }
