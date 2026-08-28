import { FormEvent, PointerEvent, useRef, useState } from 'react'
import { AlertTriangle, Camera, CarFront, ChevronRight, Gauge, MapPin, PenLine, Plus, Trash2, X } from 'lucide-react'

const vehiclePhotos = [
  'Frente do veículo', 'Porta do motorista', 'Banco do motorista', 'Porta traseira — motorista',
  'Banco traseiro — motorista', 'Traseira do veículo', 'Porta-malas', 'Porta do passageiro',
  'Banco do passageiro', 'Porta traseira — passageiro', 'Banco traseiro — passageiro',
]

const vehicles = [
  { id: 'ABC1D23', label: 'Fiat Strada · ABC1D23', km: 45820 },
  { id: 'EFG4H56', label: 'VW Saveiro · EFG4H56', km: 32744 },
  { id: 'IJK7L89', label: 'Renault Oroch · IJK7L89', km: 61108 },
]

type Damage = { id: string; location: string; description: string }

export function KmForm({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [vehicleId, setVehicleId] = useState('')
  const [km, setKm] = useState('')
  const [changeDriver, setChangeDriver] = useState(false)
  const [hasDamage, setHasDamage] = useState(false)
  const [damages, setDamages] = useState<Damage[]>([{ id: crypto.randomUUID(), location: '', description: '' }])
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState('')
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === vehicleId)
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const addDamage = () => setDamages(current => [...current, { id: crypto.randomUUID(), location: '', description: '' }])
  const updateDamage = (id: string, field: 'location' | 'description', value: string) => setDamages(current => current.map(item => item.id === id ? { ...item, [field]: value } : item))
  const removeDamage = (id: string) => setDamages(current => current.length === 1 ? current : current.filter(item => item.id !== id))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const informed = Number(km)
    if (selectedVehicle && informed < selectedVehicle.km) {
      setError(`A quilometragem informada (${informed.toLocaleString('pt-BR')} km) é menor que a última registrada: ${selectedVehicle.km.toLocaleString('pt-BR')} km.`)
      return
    }
    if (changeDriver && !signed) {
      setError('A assinatura do condutor atual é obrigatória para a troca de condutor.')
      return
    }
    setError('')
    onComplete()
  }

  return <div className="full-screen-layer km-layer">
    <form className="km-form" onSubmit={submit}>
      <header className="form-page-header"><div><p className="eyebrow">Operação com veículo</p><h2>Relatório de KM</h2><p>Preencha antes de ligar o veículo. A localização e o horário real serão registrados de forma protegida.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={21} /></button></header>
      <div className="form-progress"><span className="active">1</span><i /><span className={changeDriver ? 'active' : ''}>2</span><i /><span className={changeDriver ? 'active' : ''}>3</span><small>Informações</small><small>Condição do veículo</small><small>Assinatura</small></div>

      <main className="km-form-content">
        <section className="form-section">
          <div className="form-section-title"><span><CarFront size={20} /></span><div><h3>Informações da movimentação</h3><p>O condutor atual será identificado automaticamente pelo usuário conectado.</p></div></div>
          <div className="large-form-grid">
            <label>Veículo<select value={vehicleId} onChange={event => { setVehicleId(event.target.value); setKm(''); setError('') }} required><option value="">Selecione um veículo</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
            <label>Condutor atual<input value="Gabriel Alcantara" readOnly /></label>
            <label>Data<input type="date" value={today} min={today} max={today} readOnly /></label>
            <label>Horário informado<input type="time" defaultValue={now} required /></label>
            <label>Quilometragem atual<div className="km-input"><Gauge size={17} /><input type="number" min="0" step="1" value={km} onChange={event => { setKm(event.target.value); setError('') }} placeholder={selectedVehicle ? `Última: ${selectedVehicle.km.toLocaleString('pt-BR')} km` : 'Informe o KM'} required /></div></label>
            <label>Cliente (opcional)<select defaultValue=""><option value="">Sem cliente</option><option>Cliente Alpha</option><option>Hospital Central</option><option>Outros</option></select></label>
            <label className="wide">Destino<input placeholder="Informe para onde está indo" required /></label>
            <label>Motivo<select defaultValue="Atendimento"><option>Atendimento</option><option>Implantação</option><option>Retirada de material</option><option>Devolução</option><option>Outro</option></select></label>
            <label className="full">Observação (opcional)<textarea placeholder="Inclua uma informação importante, se necessário." /></label>
          </div>
          {selectedVehicle && <div className="last-km"><Gauge size={17} /><span>Última quilometragem registrada para este veículo:</span><b>{selectedVehicle.km.toLocaleString('pt-BR')} km</b></div>}
          {error && <div className="form-error"><AlertTriangle size={18} />{error}</div>}
        </section>

        <section className="form-section toggle-section"><div><h3>Houve troca de condutor?</h3><p>Quando houver troca, será obrigatório registrar as condições e fotos do veículo.</p></div><div className="segmented"><button type="button" className={!changeDriver ? 'active' : ''} onClick={() => setChangeDriver(false)}>Não</button><button type="button" className={changeDriver ? 'active' : ''} onClick={() => setChangeDriver(true)}>Sim</button></div></section>

        {changeDriver && <>
          <section className="form-section">
            <div className="form-section-title"><span><Camera size={20} /></span><div><h3>Fotos obrigatórias do veículo</h3><p>As imagens devem ser feitas agora pela câmera do celular.</p></div></div>
            <div className="photo-grid">{vehiclePhotos.map((label, index) => <CameraField key={label} label={`${index + 1}. ${label}`} required />)}</div>
          </section>

          <section className="form-section toggle-section"><div><h3>O veículo possui avarias?</h3><p>Se houver, registre cada local com uma descrição e duas fotos.</p></div><div className="segmented"><button type="button" className={!hasDamage ? 'active' : ''} onClick={() => setHasDamage(false)}>Não</button><button type="button" className={hasDamage ? 'active danger' : ''} onClick={() => setHasDamage(true)}>Sim</button></div></section>

          {hasDamage && <section className="form-section"><div className="form-section-title"><span className="danger-icon"><AlertTriangle size={20} /></span><div><h3>Avarias identificadas</h3><p>As avarias aparecerão antes das fotos gerais no PDF.</p></div></div><div className="damage-list">{damages.map((damage, index) => <article className="damage-card" key={damage.id}><div className="damage-heading"><b>Avaria {index + 1}</b><button type="button" onClick={() => removeDamage(damage.id)}><Trash2 size={16} /> Remover</button></div><div className="large-form-grid"><label>Local da avaria<input value={damage.location} onChange={event => updateDamage(damage.id, 'location', event.target.value)} placeholder="Ex.: Para-choque dianteiro" required /></label><label className="wide">Descrição<input value={damage.description} onChange={event => updateDamage(damage.id, 'description', event.target.value)} placeholder="Descreva o dano encontrado" required /></label></div><div className="photo-grid damage-photos"><CameraField label="Foto 1 da avaria" required /><CameraField label="Foto 2 da avaria" required /></div></article>)}</div><button type="button" className="secondary-button" onClick={addDamage}><Plus size={17} /> Adicionar outra avaria</button></section>}

          <section className="form-section">
            <div className="form-section-title"><span><PenLine size={20} /></span><div><h3>Assinatura do condutor atual</h3><p>Assine confirmando o recebimento e as condições registradas do veículo.</p></div></div>
            <SignaturePad onChange={setSigned} />
          </section>
        </>}
      </main>

      <footer className="form-page-footer"><p><MapPin size={17} />Localização, data, hora real e precisão do GPS serão registradas.</p><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button">{changeDriver ? 'Registrar e gerar PDF' : 'Registrar quilometragem'} <ChevronRight size={18} /></button></div></footer>
    </form>
  </div>
}

function CameraField({ label, required }: { label: string; required?: boolean }) {
  const [fileName, setFileName] = useState('')
  return <label className={fileName ? 'camera-field filled' : 'camera-field'}><input type="file" accept="image/*" capture="environment" required={required} onChange={event => setFileName(event.target.files?.[0]?.name ?? '')} /><Camera size={21} /><b>{fileName ? 'Foto registrada' : label}</b><small>{fileName || 'Abrir câmera'}</small></label>
}

function SignaturePad({ onChange }: { onChange: (signed: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }
  }
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true
    const canvas = canvasRef.current!
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')!
    const current = point(event)
    context.beginPath()
    context.moveTo(current.x, current.y)
  }
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const context = canvasRef.current!.getContext('2d')!
    const current = point(event)
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.strokeStyle = '#17211b'
    context.lineTo(current.x, current.y)
    context.stroke()
    onChange(true)
  }
  const stop = () => { drawing.current = false }
  const clear = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    onChange(false)
  }
  return <div className="signature-wrap"><canvas ref={canvasRef} width="900" height="230" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} /><span>Assine com o dedo dentro da área</span><button type="button" onClick={clear}>Limpar assinatura</button></div>
}
