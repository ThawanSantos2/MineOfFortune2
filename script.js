import { supabase, gerarCodigo } from './supabase.js';
export { supabase };

/* 🎲 Função de Mineração e Avanço */
export async function minerarEAvancar(userId) {
  const { data: perfil, error: e1 } = await supabase
    .from('usuarios')
    .select('pepitas, minas_completas, fase')
    .eq('id', userId)
    .single();
  if (e1) throw e1;

  const { data: lastKit, error: e2 } = await supabase
    .from('picareta_compras')
    .select('kit')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (e2) throw e2;

  const reward = lastKit.kit === 'basico' ? 85 : 255;
  const presas = 51;

  await supabase.from('spins').insert({
    usuario_id: userId,
    pepitas_ganhas: reward,
    presas,
    rodada: perfil.minas_completas + 1
  });

  await supabase
    .from('usuarios')
    .update({
      pepitas: perfil.pepitas + (reward - presas),
      minas_completas: perfil.minas_completas + 1,
      fase: Math.min(perfil.fase + 1, 4)
    })
    .eq('id', userId);
}

/* 🎫 Autenticação e Perfil */
export async function registrarUsuario({ email, senha, nome, usuario, pais, indicante }) {
  if (!/\S+@\S+\.\S+/.test(email)) throw new Error('Email inválido');
  if (senha.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres');

  const { data: signUpData, error: authError } = await supabase.auth.signUp({ email, password: senha });
  if (authError) throw new Error(authError.message);

  const userId = signUpData.user.id;
  const codigo = gerarCodigo();

  const { data: perfilData, error: insertError } = await supabase
    .from('usuarios')
    .insert([{ id: userId, nome, usuario, email, pais, codigo_indicacao: codigo }])
    .select();
  if (insertError) throw insertError;

  if (indicante) {
    const { error } = await supabase
      .from('indicacoes')
      .insert([{ indicante_id: indicante, indicado_id: userId }]);
    if (error) console.error('Erro ao registrar indicação:', error);
  }
  

  return perfilData[0];
}

export async function loginUsuario(email, senha) {
  const { data: si, error: e1 } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (e1 || !si.user) throw e1;

  const id = si.user.id;
  const { data, error: e2 } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single();
  if (e2) throw e2;

  return data;
}

export async function carregarUsuarioAtual() {
  const { data: sess } = await supabase.auth.getSession();
  const id = sess.session?.user?.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  return data;
}

/**
 * Busca recursivamente no Supabase até 4 níveis de indicações.
 */
export async function gerarArvoreIndicacoes(parentIds) {
  const niveis = {};
  let atuais = parentIds;
  for (let nivel = 1; nivel <= 4; nivel++) {
    if (atuais.length === 0) {
      niveis[nivel] = [];
      continue;
    }
    const { data, error } = await supabase
      .from('indicacoes')
      .select('indicante_id, indicado_id, usuarios!fk_indicado_usuario(nome, fase)')
      .in('indicante_id', atuais)
      .eq('valido', true);
    if (error) throw error;
    niveis[nivel] = data.slice(0, [8,4,2,1][nivel-1]).map(r => ({ id: r.indicado_id, nome: r.usuarios.nome, fase: r.usuarios.fase }));
    atuais = niveis[nivel].map(i => i.id);
  }
  return niveis;
}

/* 🛒 Loja: Compra de Kits */
async function comprarKit(usuarioId, tipo) {
  const { data: perfil, error: e1 } = await supabase
    .from('usuarios')
    .select('pepitas, fase')
    .eq('id', usuarioId)
    .single();
  if (e1) throw e1;

  const isBasico = tipo === 'basico';
  const custo = isBasico ? 17 : 51;
  if (perfil.pepitas < custo) throw new Error('Pepitas insuficientes');

  const { error: e2 } = await supabase
    .from(isBasico ? 'picareta_compras' : 'kit_compras')
    .insert([{ usuario_id: usuarioId, status: 'confirmado', kit: tipo }]);
    if (isBasico) {
      await supabase
        .from('indicacoes')
        .update({ valido: true })
        .eq('indicado_id', usuarioId);
    }    
  if (e2) throw e2;

  const { error: e3 } = await supabase
  .from('usuarios')
  .update({ pepitas: perfil.pepitas - custo })
  .eq('id', usuarioId);
if (e3) throw e3;

// Marca indicação como válida se for kit básico
if (isBasico) {
  await supabase
    .from('indicacoes')
    .update({ valido: true })
    .eq('indicado_id', usuarioId);
}

// Atualiza fase automaticamente com base na rede
await calcularFaseUsuario(usuarioId);

}

export function comprarPicareta(usuarioId) {
  return comprarKit(usuarioId, 'basico');
}
export function comprarPicaretaMelhorada(usuarioId) {
  return comprarKit(usuarioId, 'avancado');
}

export async function calcularFaseUsuario(usuarioId) {
  const niveis = await gerarArvoreIndicacoes([usuarioId]);

  let novaFase = 0;

  // Força fase 1 se o usuário comprou a picareta básica
  const { data: compras } = await supabase
    .from('picareta_compras')
    .select('kit')
    .eq('usuario_id', usuarioId);

  const comprouBasica = compras?.some(c => c.kit === 'basico');

  if (comprouBasica) novaFase = 1;
  if ((niveis[1]?.length || 0) >= 2) novaFase = 2;
  if ((niveis[2]?.length || 0) >= 4) novaFase = 3;
  if ((niveis[4]?.length || 0) >= 1) novaFase = 4;


  await supabase
    .from('usuarios')
    .update({ fase: novaFase })
    .eq('id', usuarioId);

  return novaFase;
}


export async function finalizarMina(usuarioId) {
  const { data: user, error } = await supabase
    .from('usuarios')
    .select('pepitas, minas_completas, fase')
    .eq('id', usuarioId)
    .single();
  if (error) throw error;

  const { data: kitData } = await supabase
    .from('picareta_compras')
    .select('kit')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const premio = kitData.kit === 'basico' ? 85 : 255;
  const presas = 51;

  await supabase.from('usuarios')
  .update({
    pepitas: user.pepitas + (premio - presas),
    presas,
    minas_completas: user.minas_completas + 1,
    fase: 0
  })
  .eq('id', usuarioId);

// 🧹 Resetar indicações válidas da equipe
await supabase
  .from('indicacoes')
  .update({ valido: false })
  .eq('indicante_id', usuarioId);


  await supabase.from('spins').insert({
    usuario_id: usuarioId,
    pepitas_ganhas: premio,
    presas,
    rodada: user.minas_completas + 1
  });

  const { data: indicacao } = await supabase
    .from('indicacoes')
    .select('indicante_id')
    .eq('indicado_id', usuarioId)
    .single();

  if (indicacao?.indicante_id) {
    const bonus = Math.floor(premio * 0.2);
    await supabase.rpc('incrementar_pepitas', {
      uid: indicacao.indicante_id,
      quantidade: bonus
    });
  }
}

const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('-translate-x-full');
    });

/* 💾 Armazenamento Local */
export function salvarLocal(dados) {
  localStorage.setItem('yesUser', JSON.stringify(dados));
}
export function pegarLocal() {
  return JSON.parse(localStorage.getItem('yesUser') || 'null');
}