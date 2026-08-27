export type Page = 'inicio' | 'clientes' | 'trajetos' | 'estoque' | 'km' | 'relatorios'

export type Cliente = { id: string; nome: string; cidade?: string; estado?: string; endereco: string; latitude?: string; longitude?: string; centralizadores: Centralizador[] }
export type MeioLink = 'Antena' | 'Fibra' | 'Cabo de rede'
export type Link = { id: string; ponto: string; meio: MeioLink; antenaTipo?: 'AP' | 'ST'; antenaModelo?: string; antenaIp?: string; fibraTipo?: 'Monomodo' | 'Multimodo'; vias?: string; caboBlindagem?: 'FTP' | 'UTP'; caboCategoria?: 'Cat5e' | 'Cat6' }
export type DispositivoSwitch = { id: string; nome: string; porta: string; ip: string }
export type Centralizador = { id: string; nome: string; tipo: 'Quadro' | 'Rack' | 'Outro'; localizacao: string; listaEquipamentos?: string; equipamentos: Equipamento[]; origem?: Link; destinos: Link[] }
export type Equipamento = { id: string; nome: string; tipo: 'Nobreak' | 'Bateria' | 'Switch' | 'Outro'; ips: string; portas?: number; localizacao: string; status: 'Ativo' | 'Inativo'; dispositivos?: DispositivoSwitch[] }
export type Tecnico = { id: string; nome: string; itens: ItemEstoque[] }
export type ItemEstoque = { id: string; nome: string; tipo: 'Ferramenta' | 'Insumo'; quantidade: number; status: 'Ativo' | 'Retirado'; observacao: string }
export type Trajeto = { id: string; data: string; acao: string; hora: string; tecnico: string; equipe: string; cliente: string; observacao: string }
export type RegistroKm = { id: string; data: string; carro: string; motorista: string; trajeto: string; km: number; avarias: boolean; observacao: string }
export type Database = { clientes: Cliente[]; tecnicos: Tecnico[]; trajetos: Trajeto[]; km: RegistroKm[] }
