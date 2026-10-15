import { FormEvent, useMemo, useState } from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, ChevronRight, ClipboardCheck, Download, FileCheck2,
  HardDrive, ImagePlus, MonitorCog, Plus, RotateCcw, Search, Server, Trash2, X,
} from 'lucide-react'
import type {
  AppData, SystemPreventiveAssetType, SystemPreventiveChecklistAnswer, SystemPreventiveChecklistStatus,
  SystemPreventivePhoto, SystemPreventiveRecord,
} from './store'
import { capacityMetrics, downloadSystemPreventivePdf } from './systemPreventivePdf'

type DraftChecklistAnswer = Omit<SystemPreventiveChecklistAnswer, 'status'> & { status: SystemPreventiveChecklistStatus | '' }
type PreventiveDraft = {
  serviceDate: string
  client: string
  assetType: SystemPreventiveAssetType
  assetName: string
  model: string
  serialNumber: string
  ipAddress: string
  assetFunction: string
  workstationUser: string
  operatingSystem: string
  operatingSystemBuild: string
  cpuUsagePercent: string
  memoryUsagePercent: string
  diskUsagePercent: string
  usageObservation: string
  digifortVersion: string
  digifortVerificationDate: string
  offlineCameras: string
  digifortObservation: string
  monitoredCameras: string
  operationalProfile: string
  storageCapacityTb: string
  storageUsedTb: string
  generalObservation: string
  starterTier: string
  totalCameras: string
  onlineCameras: string
  otherDevices: string
  retentionDays: string
  averageBitrateMbps: string
  resolution: string
  fps: string
  codec: string
  storageTotalTb: string
  capacityStorageUsedTb: string
  storageFreeTb: string
  diskCount: string
  raidVolume: string
  checklist: DraftChecklistAnswer[]
  photos: SystemPreventivePhoto[]
}

const checklistDefinitions: Record<SystemPreventiveAssetType, { section: string; items: string[] }[]> = {
  Servidor: [
    { section: 'Hardware', items: ['Estado físico', 'Limpeza interna e externa', 'Ventoinhas e fluxo de ar', 'Fontes redundantes', 'Cabos e conectores', 'Memória RAM', 'CPU e temperatura', 'Controladora RAID', 'BIOS e firmware', 'iDRAC / iLO'] },
    { section: 'Sistema operacional', items: ['Windows atualizado', 'Serviços essenciais', 'Eventos do sistema', 'CPU e memória RAM', 'Espaço do sistema operacional', 'Sincronismo de horário'] },
    { section: 'Digifort / CFTV', items: ['Serviço Digifort', 'Banco e serviços', 'Licenciamento', 'Câmeras offline', 'Gravação', 'Alarmes e eventos', 'Integrações e dispositivos', 'Logs Digifort'] },
    { section: 'Armazenamento', items: ['Saúde dos discos', 'RAID e volume', 'Espaço disponível', 'Erros de disco', 'SMART', 'Política de retenção'] },
  ],
  Workstation: [
    { section: 'Workstation', items: ['Estado físico', 'Limpeza', 'Temperaturas', 'CPU', 'Memória RAM', 'GPU', 'Discos / SSD', 'Fonte', 'Windows e drivers', 'Rede', 'Eventos', 'Aplicações críticas'] },
  ],
  Storage: [
    { section: 'Storage', items: ['Estado físico', 'Controladora', 'Discos', 'RAID', 'SMART e saúde', 'Volumes', 'Alertas', 'Firmware', 'Rede', 'Logs'] },
  ],
}

const assetOptions: { value: SystemPreventiveAssetType; label: string; icon: typeof Server }[] = [
  { value: 'Servidor', label: 'Servidor', icon: Server },
  { value: 'Workstation', label: 'Workstation', icon: MonitorCog },
  { value: 'Storage', label: 'Storage', icon: HardDrive },
]

function localDateInput(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function newChecklist(type: SystemPreventiveAssetType): DraftChecklistAnswer[] {
  return checklistDefinitions[type].flatMap(group => group.items.map(item => ({ id: crypto.randomUUID(), section: group.section, item, status: '', observation: '' })))
}

function newDraft(type: SystemPreventiveAssetType = 'Servidor'): PreventiveDraft {
  return {
    serviceDate: localDateInput(), client: '', assetType: type, assetName: '', model: '', serialNumber: '', ipAddress: '', assetFunction: '', workstationUser: '',
    operatingSystem: '', operatingSystemBuild: '', cpuUsagePercent: '', memoryUsagePercent: '', diskUsagePercent: '', usageObservation: '',
    digifortVersion: '', digifortVerificationDate: localDateInput(), offlineCameras: '', digifortObservation: '', monitoredCameras: '', operationalProfile: '',
    storageCapacityTb: '', storageUsedTb: '', generalObservation: '', starterTier: '150', totalCameras: '', onlineCameras: '', otherDevices: '',
    retentionDays: '31', averageBitrateMbps: '', resolution: '', fps: '15', codec: 'H.264', storageTotalTb: '', capacityStorageUsedTb: '', storageFreeTb: '', diskCount: '', raidVolume: '',
    checklist: newChecklist(type), photos: [],
  }
}

export function SystemPreventivePage({ data, onChange }: { data: AppData; onChange: (data: AppData, message?: string) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [completed, setCompleted] = useState<SystemPreventiveRecord | null>(null)
  const recent = [...data.systemPreventives].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 5)
  const nonConforming = data.systemPreventives.reduce((total, record) => total + record.checklist.filter(answer => answer.status === 'Não conforme').length, 0)

  const complete = (record: SystemPreventiveRecord) => {
    onChange({ ...data, systemPreventives: [...data.systemPreventives, record] }, 'Preventiva sistêmica enviada com sucesso.')
    setFormOpen(false)
    setCompleted(record)
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Atendimento</p><h2>Preventiva sistêmica</h2><p>Documente servidores, workstations e storages com checklist, evidências e análise de capacidade.</p></div><button className="primary-button" onClick={() => setFormOpen(true)}><Plus size={18} /> Nova preventiva</button></section>
    <section className="document-summary-grid preventive-summary-grid">
      <article className="metric-card"><span><FileCheck2 size={21} /></span><div><b>{data.systemPreventives.length}</b><small>Preventivas enviadas</small></div></article>
      <article className="metric-card"><span><Server size={21} /></span><div><b>{new Set(data.systemPreventives.map(record => record.client)).size}</b><small>Clientes atendidos</small></div></article>
      <article className="metric-card"><span><AlertTriangle size={21} /></span><div><b>{nonConforming}</b><small>Itens não conformes</small></div></article>
    </section>
    <section className="surface preventive-recent-card"><div className="table-toolbar"><div><p className="eyebrow">Seus registros</p><h3>Últimas preventivas enviadas</h3></div></div>{recent.length ? <div className="preventive-recent-list">{recent.map(record => {
      const AssetIcon = assetOptions.find(option => option.value === record.assetType)?.icon ?? Server
      const issues = record.checklist.filter(answer => answer.status === 'Não conforme').length
      return <article key={record.id}><span><AssetIcon size={18} /></span><div><b>{record.client} · {record.assetName}</b><small>{record.code} · {record.assetType} · {formatDate(record.serviceDate)}</small></div><strong className={issues ? 'danger' : 'success'}>{issues ? `${issues} não conforme` : 'Conforme'}</strong></article>
    })}</div> : <div className="table-empty">Nenhuma preventiva sistêmica foi enviada por este acesso.</div>}</section>
    {formOpen && <SystemPreventiveForm data={data} onCancel={() => setFormOpen(false)} onComplete={complete} />}
    {completed && <PreventiveDownloadDialog record={completed} onClose={() => setCompleted(null)} />}
  </>
}

function SystemPreventiveForm({ data, onCancel, onComplete }: { data: AppData; onCancel: () => void; onComplete: (record: SystemPreventiveRecord) => void }) {
  const [draft, setDraft] = useState<PreventiveDraft>(() => newDraft())
  const [error, setError] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [sending, setSending] = useState(false)
  const update = <K extends keyof PreventiveDraft>(key: K, value: PreventiveDraft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const groups = useMemo(() => [...new Set(draft.checklist.map(answer => answer.section))], [draft.checklist])
  const capacity = useMemo(() => capacityMetrics({
    starterTier: numeric(draft.starterTier) || 150, totalCameras: numeric(draft.totalCameras), onlineCameras: numeric(draft.onlineCameras), otherDevices: numeric(draft.otherDevices),
    retentionDays: numeric(draft.retentionDays) || 1, averageBitrateMbps: numeric(draft.averageBitrateMbps), resolution: draft.resolution, fps: numeric(draft.fps), codec: draft.codec,
    storageTotalTb: numeric(draft.storageTotalTb), storageUsedTb: numeric(draft.capacityStorageUsedTb), storageFreeTb: numeric(draft.storageFreeTb), diskCount: numeric(draft.diskCount), raidVolume: draft.raidVolume,
  }), [draft])

  const changeAssetType = (assetType: SystemPreventiveAssetType) => setDraft(current => ({ ...current, assetType, checklist: newChecklist(assetType) }))
  const updateChecklist = (id: string, values: Partial<DraftChecklistAnswer>) => update('checklist', draft.checklist.map(answer => answer.id === id ? { ...answer, ...values } : answer))
  const markAllConforming = () => update('checklist', draft.checklist.map(answer => ({ ...answer, status: 'Conforme' })))
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setProcessingPhoto(true); setError('')
    try {
      const photos = await Promise.all([...files].filter(file => file.type.startsWith('image/')).map(async file => ({ id: crypto.randomUUID(), name: file.name, data: await compressPhoto(file) })))
      update('photos', [...draft.photos, ...photos])
    } catch {
      setError('Não foi possível preparar uma das imagens. Tente fotografar novamente.')
    } finally { setProcessingPhoto(false) }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const unanswered = draft.checklist.filter(answer => !answer.status)
    if (unanswered.length) return setError(`Responda todos os itens do checklist. Ainda faltam ${unanswered.length}.`)
    if (numeric(draft.onlineCameras) > numeric(draft.totalCameras) && draft.assetType === 'Servidor') return setError('A quantidade de câmeras online não pode ser maior que o total de câmeras.')
    if (numeric(draft.capacityStorageUsedTb) > numeric(draft.storageTotalTb) && numeric(draft.storageTotalTb) > 0 && draft.assetType === 'Servidor') return setError('O storage usado não pode ser maior que a capacidade total.')
    setSending(true)
    const createdAt = new Date().toISOString()
    const record: SystemPreventiveRecord = {
      id: crypto.randomUUID(), code: nextPreventiveCode(data.systemPreventives, new Date()), createdAt, createdById: data.account.id, createdByName: data.account.name,
      serviceDate: draft.serviceDate, client: draft.client.trim(), assetType: draft.assetType, assetName: draft.assetName.trim(), model: draft.model.trim(), serialNumber: draft.serialNumber.trim(),
      ipAddress: draft.ipAddress.trim(), assetFunction: draft.assetFunction.trim(), workstationUser: draft.workstationUser.trim(), operatingSystem: draft.operatingSystem.trim(),
      operatingSystemBuild: draft.operatingSystemBuild.trim(), cpuUsagePercent: optionalNumber(draft.cpuUsagePercent), memoryUsagePercent: optionalNumber(draft.memoryUsagePercent),
      diskUsagePercent: optionalNumber(draft.diskUsagePercent), usageObservation: draft.usageObservation.trim(), digifortVersion: draft.digifortVersion.trim(),
      digifortVerificationDate: draft.digifortVerificationDate, offlineCameras: optionalNumber(draft.offlineCameras), digifortObservation: draft.digifortObservation.trim(),
      monitoredCameras: optionalNumber(draft.monitoredCameras), operationalProfile: draft.operationalProfile.trim(), storageCapacityTb: optionalNumber(draft.storageCapacityTb),
      storageUsedTb: optionalNumber(draft.storageUsedTb), generalObservation: draft.generalObservation.trim(),
      capacity: draft.assetType === 'Servidor' ? {
        starterTier: numeric(draft.starterTier) || 150, totalCameras: numeric(draft.totalCameras), onlineCameras: numeric(draft.onlineCameras), otherDevices: numeric(draft.otherDevices),
        retentionDays: numeric(draft.retentionDays) || 1, averageBitrateMbps: numeric(draft.averageBitrateMbps), resolution: draft.resolution.trim(), fps: numeric(draft.fps), codec: draft.codec,
        storageTotalTb: numeric(draft.storageTotalTb), storageUsedTb: numeric(draft.capacityStorageUsedTb), storageFreeTb: numeric(draft.storageFreeTb), diskCount: numeric(draft.diskCount), raidVolume: draft.raidVolume.trim(),
      } : undefined,
      checklist: draft.checklist as SystemPreventiveChecklistAnswer[], photos: draft.photos,
    }
    onComplete(record)
  }

  return <div className="full-screen-layer preventive-form-layer"><form className="preventive-form" onSubmit={submit}>
    <header className="form-page-header"><div><p className="eyebrow">Atendimento · Preventiva sistêmica</p><h2>Novo relatório de preventiva</h2><p>O preenchimento será salvo como dados estruturados e o PDF será montado quando solicitado.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Fechar formulário"><X size={22} /></button></header>
    <main className="preventive-form-content">
      <section className="form-section"><div className="form-section-title"><span><Server size={20} /></span><div><h3>Tipo de equipamento</h3><p>Selecione o ativo para carregar o checklist correspondente.</p></div></div><div className="preventive-type-selector">{assetOptions.map(option => {
        const Icon = option.icon
        return <button type="button" className={draft.assetType === option.value ? 'active' : ''} onClick={() => changeAssetType(option.value)} key={option.value}><Icon size={21} /><span>{option.label}</span></button>
      })}</div></section>

      <section className="form-section"><div className="form-section-title"><span><FileCheck2 size={20} /></span><div><h3>Identificação</h3><p>Informe o cliente e os dados que identificam o equipamento.</p></div></div><div className="large-form-grid">
        <label>Cliente<input value={draft.client} onChange={event => update('client', event.target.value)} placeholder="Digite o cliente" required /></label>
        <label>Data da preventiva<input type="date" value={draft.serviceDate} onChange={event => update('serviceDate', event.target.value)} required /></label>
        <label>Equipamento / hostname<input value={draft.assetName} onChange={event => update('assetName', event.target.value)} placeholder="Nome ou hostname" required /></label>
        <label>Modelo<input value={draft.model} onChange={event => update('model', event.target.value)} placeholder="Modelo do equipamento" /></label>
        <label>Serial / Service Tag<input value={draft.serialNumber} onChange={event => update('serialNumber', event.target.value)} /></label>
        <label>Endereço IP<input value={draft.ipAddress} onChange={event => update('ipAddress', event.target.value)} inputMode="decimal" placeholder="Ex.: 192.168.0.10" /></label>
        <label className="full">Função do equipamento<input value={draft.assetFunction} onChange={event => update('assetFunction', event.target.value)} placeholder="Ex.: servidor de gravação, estação de monitoramento" /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><span><MonitorCog size={20} /></span><div><h3>Utilização e sistema</h3><p>Registre o consumo de recursos e as informações do sistema operacional.</p></div></div><div className="large-form-grid">
        <NumericField label="Uso de CPU (%)" value={draft.cpuUsagePercent} onChange={value => update('cpuUsagePercent', value)} max={100} />
        <NumericField label="Uso de memória RAM (%)" value={draft.memoryUsagePercent} onChange={value => update('memoryUsagePercent', value)} max={100} />
        <NumericField label="Uso de disco (%)" value={draft.diskUsagePercent} onChange={value => update('diskUsagePercent', value)} max={100} />
        <label>Sistema operacional / versão<input value={draft.operatingSystem} onChange={event => update('operatingSystem', event.target.value)} /></label>
        <label>Build<input value={draft.operatingSystemBuild} onChange={event => update('operatingSystemBuild', event.target.value)} /></label>
        {draft.assetType === 'Workstation' && <label>Usuário da workstation<input value={draft.workstationUser} onChange={event => update('workstationUser', event.target.value)} /></label>}
        <label className="full">Observação da utilização<textarea value={draft.usageObservation} onChange={event => update('usageObservation', event.target.value)} placeholder="Picos, indisponibilidades ou comportamento observado" /></label>
      </div></section>

      {draft.assetType === 'Servidor' && <>
        <section className="form-section"><div className="form-section-title"><span><MonitorCog size={20} /></span><div><h3>Digifort / CFTV</h3><p>Informações do ambiente de monitoramento e gravação.</p></div></div><div className="large-form-grid">
          <label>Versão Digifort<input value={draft.digifortVersion} onChange={event => update('digifortVersion', event.target.value)} /></label>
          <label>Data da verificação<input type="date" value={draft.digifortVerificationDate} onChange={event => update('digifortVerificationDate', event.target.value)} /></label>
          <NumericField label="Câmeras offline" value={draft.offlineCameras} onChange={value => update('offlineCameras', value)} />
          <label className="full">Observações Digifort<textarea value={draft.digifortObservation} onChange={event => update('digifortObservation', event.target.value)} /></label>
        </div></section>
        <section className="form-section"><div className="form-section-title"><span><HardDrive size={20} /></span><div><h3>Capacity Planning</h3><p>Dimensionamento de câmeras, bitrate, armazenamento e retenção.</p></div></div><div className="large-form-grid">
          <label>Faixa Starter Kit<select value={draft.starterTier} onChange={event => update('starterTier', event.target.value)}><option value="50">Até 50 câmeras</option><option value="150">Até 150 câmeras</option><option value="250">Até 250 câmeras</option></select></label>
          <NumericField label="Total de câmeras" value={draft.totalCameras} onChange={value => update('totalCameras', value)} />
          <NumericField label="Câmeras online" value={draft.onlineCameras} onChange={value => update('onlineCameras', value)} />
          <NumericField label="Outros dispositivos" value={draft.otherDevices} onChange={value => update('otherDevices', value)} />
          <NumericField label="Retenção desejada (dias)" value={draft.retentionDays} onChange={value => update('retentionDays', value)} min={1} />
          <NumericField label="Bitrate médio por câmera (Mbps)" value={draft.averageBitrateMbps} onChange={value => update('averageBitrateMbps', value)} step="0.01" />
          <label>Resolução predominante<input value={draft.resolution} onChange={event => update('resolution', event.target.value)} placeholder="720p / 1080p / 4MP" /></label>
          <NumericField label="FPS" value={draft.fps} onChange={value => update('fps', value)} />
          <label>Codec<select value={draft.codec} onChange={event => update('codec', event.target.value)}><option>H.264</option><option>H.265</option><option>H.265+</option><option>Outro</option></select></label>
          <NumericField label="Storage total (TB)" value={draft.storageTotalTb} onChange={value => update('storageTotalTb', value)} step="0.01" />
          <NumericField label="Storage usado (TB)" value={draft.capacityStorageUsedTb} onChange={value => update('capacityStorageUsedTb', value)} step="0.01" />
          <NumericField label="Storage livre (TB)" value={draft.storageFreeTb} onChange={value => update('storageFreeTb', value)} step="0.01" />
          <NumericField label="Quantidade de discos" value={draft.diskCount} onChange={value => update('diskCount', value)} />
          <label className="wide">RAID / volume<input value={draft.raidVolume} onChange={event => update('raidVolume', event.target.value)} placeholder="RAID 5 / RAID 6 / Storage Pool" /></label>
        </div><div className="preventive-capacity-preview"><article><small>Consumo diário</small><b>{decimal(capacity.dailyTb)} TB</b></article><article><small>Necessário para retenção</small><b>{decimal(capacity.requiredTb)} TB</b></article><article><small>Retenção estimada</small><b>{decimal(capacity.estimatedDays)} dias</b></article><article><small>Uso da faixa</small><b>{decimal(capacity.starterUsePercent)}%</b></article></div></section>
      </>}

      {draft.assetType === 'Workstation' && <section className="form-section"><div className="form-section-title"><span><MonitorCog size={20} /></span><div><h3>Perfil operacional</h3><p>Informe o uso da estação no ambiente do cliente.</p></div></div><div className="large-form-grid">
        <NumericField label="Câmeras monitoradas" value={draft.monitoredCameras} onChange={value => update('monitoredCameras', value)} />
        <label className="wide">Perfil de operação<select value={draft.operationalProfile} onChange={event => update('operationalProfile', event.target.value)}><option value="">Selecione</option><option>CFTV</option><option>CFTV + Controle de Acesso</option><option>Controle de Acesso</option><option>Outro</option></select></label>
      </div></section>}

      {draft.assetType === 'Storage' && <section className="form-section"><div className="form-section-title"><span><HardDrive size={20} /></span><div><h3>Capacidade do storage</h3><p>Informe a capacidade física ou lógica verificada.</p></div></div><div className="large-form-grid">
        <NumericField label="Capacidade total (TB)" value={draft.storageCapacityTb} onChange={value => update('storageCapacityTb', value)} step="0.01" />
        <NumericField label="Espaço usado (TB)" value={draft.storageUsedTb} onChange={value => update('storageUsedTb', value)} step="0.01" />
      </div></section>}

      <section className="form-section"><div className="preventive-checklist-heading"><div className="form-section-title"><span><ClipboardCheck size={20} /></span><div><h3>Checklist técnico</h3><p>Classifique todos os itens e detalhe somente quando necessário.</p></div></div><button type="button" className="secondary-button" onClick={markAllConforming}><CheckCircle2 size={16} /> Marcar todos conforme</button></div>
        <div className="preventive-checklist">{groups.map(group => <section key={group}><h4>{group}</h4>{draft.checklist.filter(answer => answer.section === group).map(answer => <article key={answer.id}><div><b>{answer.item}</b><select className={answer.status === 'Não conforme' ? 'danger' : answer.status === 'Conforme' ? 'success' : ''} value={answer.status} onChange={event => updateChecklist(answer.id, { status: event.target.value as DraftChecklistAnswer['status'] })} required><option value="">Selecionar resultado</option><option>Conforme</option><option>Não conforme</option><option>Não aplicável</option></select></div><input value={answer.observation} onChange={event => updateChecklist(answer.id, { observation: event.target.value })} placeholder="Observação deste item (opcional)" /></article>)}</section>)}</div>
      </section>

      <section className="form-section"><div className="form-section-title"><span><Camera size={20} /></span><div><h3>Evidências fotográficas</h3><p>Adicione quantas evidências forem necessárias. As imagens serão comprimidas antes do envio.</p></div></div><label className="preventive-photo-add"><input type="file" accept="image/*" capture="environment" multiple onChange={event => { void addPhotos(event.target.files); event.target.value = '' }} disabled={processingPhoto} /><ImagePlus size={24} /><b>{processingPhoto ? 'Preparando imagens...' : 'Adicionar fotos'}</b><small>Câmera ou galeria do dispositivo</small></label>{draft.photos.length > 0 && <div className="preventive-photo-grid">{draft.photos.map((photo, index) => <article key={photo.id}><img src={photo.data} alt={`Evidência ${index + 1}`} /><span>{index + 1}</span><button type="button" onClick={() => update('photos', draft.photos.filter(item => item.id !== photo.id))} aria-label={`Remover foto ${index + 1}`}><Trash2 size={15} /></button></article>)}</div>}
      </section>

      <section className="form-section"><div className="form-section-title"><span><FileCheck2 size={20} /></span><div><h3>Conclusão</h3><p>Inclua recomendações, pendências ou orientações para o próximo atendimento.</p></div></div><div className="large-form-grid"><label className="full">Observações gerais<textarea value={draft.generalObservation} onChange={event => update('generalObservation', event.target.value)} maxLength={5000} placeholder="Conclusão técnica da preventiva" /></label></div></section>
      {error && <div className="form-error preventive-form-error"><AlertTriangle size={18} />{error}</div>}
    </main>
    <footer className="form-page-footer"><p><FileCheck2 size={17} />O registro será disponibilizado para consulta conforme o perfil de acesso.</p><div><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={sending || processingPhoto}>{sending ? 'Enviando...' : 'Enviar preventiva'} {!sending && <ChevronRight size={18} />}</button></div></footer>
  </form></div>
}

function NumericField({ label, value, onChange, min = 0, max, step = '1' }: { label: string; value: string; onChange: (value: string) => void; min?: number; max?: number; step?: string }) {
  return <label>{label}<input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function PreventiveDownloadDialog({ record, onClose }: { record: SystemPreventiveRecord; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    setDownloading(true)
    try { await downloadSystemPreventivePdf(record); onClose() } finally { setDownloading(false) }
  }
  return <div className="modal-layer preventive-download-layer" role="dialog" aria-modal="true" aria-labelledby="preventive-download-title"><button className="modal-backdrop" onClick={onClose} aria-label="Fechar opção de download" /><section className="quick-modal preventive-download-modal"><div className="apr-download-icon"><CheckCircle2 size={35} /></div><p className="eyebrow">Preventiva enviada</p><h2 id="preventive-download-title">Deseja salvar o PDF agora?</h2><p>O relatório foi registrado. O documento também poderá ser reconstruído posteriormente em <b>Relatórios → Preventivas sistêmicas</b>.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Agora não</button><button className="primary-button" disabled={downloading} onClick={() => void download()}><Download size={17} />{downloading ? 'Montando PDF...' : 'Salvar PDF'}</button></div></section></div>
}

export function SystemPreventiveReportsPage({ data }: { data: AppData }) {
  const [query, setQuery] = useState('')
  const [assetType, setAssetType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [downloading, setDownloading] = useState('')
  const [notice, setNotice] = useState('')
  const rows = useMemo(() => [...data.systemPreventives].filter(record => {
    if (assetType && record.assetType !== assetType) return false
    if (startDate && record.serviceDate < startDate) return false
    if (endDate && record.serviceDate > endDate) return false
    const content = `${record.code} ${record.client} ${record.assetName} ${record.model} ${record.serialNumber} ${record.createdByName}`.toLocaleLowerCase('pt-BR')
    return !query.trim() || content.includes(query.trim().toLocaleLowerCase('pt-BR'))
  }).sort((first, second) => second.createdAt.localeCompare(first.createdAt)), [data.systemPreventives, query, assetType, startDate, endDate])
  const reset = () => { setQuery(''); setAssetType(''); setStartDate(''); setEndDate('') }
  const download = async (record: SystemPreventiveRecord) => {
    setDownloading(record.id); setNotice('')
    try { await downloadSystemPreventivePdf(record); setNotice(`PDF ${record.code} construído a partir dos dados e imagens salvos.`) }
    catch { setNotice('Não foi possível construir o PDF desta preventiva.') }
    finally { setDownloading('') }
  }

  return <>
    <section className="page-intro"><div><p className="eyebrow">Consulta restrita</p><h2>Preventivas sistêmicas</h2><p>Consulte os registros enviados e construa o PDF completo no momento do download.</p></div></section>
    {notice && <div className="report-notice"><FileCheck2 size={18} />{notice}</div>}
    <section className="surface report-filter-card"><div className="report-filter-title"><Search size={19} /><div><b>Filtros da consulta</b><small>{rows.length} preventivas encontradas</small></div></div><div className="report-filter-grid preventive-report-filters">
      <label>Data inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>Data final<input type="date" min={startDate || undefined} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label>Tipo<select value={assetType} onChange={event => setAssetType(event.target.value)}><option value="">Todos</option>{assetOptions.map(option => <option key={option.value}>{option.value}</option>)}</select></label>
      <label className="report-search">Pesquisar<div><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cliente, código ou equipamento" /></div></label>
      <button className="secondary-button report-clear" onClick={reset}><RotateCcw size={16} /> Limpar filtros</button>
    </div></section>
    <section className="surface table-surface preventive-report-table"><div className="table-toolbar"><div><p className="eyebrow">Preventivas sistêmicas</p><h3>Registros disponíveis para consulta</h3></div><span className="report-count">{rows.length} registros</span></div><div className="responsive-table"><table><thead><tr><th>Data</th><th>Código</th><th>Cliente</th><th>Tipo</th><th>Equipamento</th><th>Responsável</th><th>Resultado</th><th>PDF</th></tr></thead><tbody>{rows.length ? rows.map(record => {
      const issues = record.checklist.filter(answer => answer.status === 'Não conforme').length
      return <tr key={record.id}><td>{formatDate(record.serviceDate)}</td><td><b>{record.code}</b></td><td>{record.client}</td><td>{record.assetType}</td><td>{record.assetName}<small className="table-cell-note">{[record.model, record.serialNumber].filter(Boolean).join(' · ')}</small></td><td>{record.createdByName}</td><td><span className={`status ${issues ? 'danger' : 'success'}`}>{issues ? `${issues} não conforme` : 'Conforme'}</span></td><td><button className="secondary-button compact" disabled={downloading === record.id} onClick={() => void download(record)}><Download size={15} />{downloading === record.id ? 'Montando...' : 'Baixar PDF'}</button></td></tr>
    }) : <tr><td colSpan={8} className="table-empty">Nenhuma preventiva encontrada com os filtros informados.</td></tr>}</tbody></table></div></section>
  </>
}

function nextPreventiveCode(records: SystemPreventiveRecord[], date: Date) {
  const year = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const prefix = `PREV${year}${month}`
  const sequence = records.filter(record => record.code.startsWith(prefix)).reduce((largest, record) => Math.max(largest, Number(record.code.slice(prefix.length)) || 0), 0) + 1
  return `${prefix}${String(sequence).padStart(4, '0')}`
}

function numeric(value: string) { const number = Number(String(value).replace(',', '.')); return Number.isFinite(number) ? number : 0 }
function optionalNumber(value: string) { return value.trim() === '' ? null : numeric(value) }
function decimal(value: number) { return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }
function formatDate(value: string) { const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR') }

async function compressPhoto(file: File) {
  const source = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = reject
      element.src = source
    })
    const maximum = 1600
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', .8)
  } finally { URL.revokeObjectURL(source) }
}
