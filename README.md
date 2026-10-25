# Meu Controle Financeiro

Dashboard pessoal para controlar os gastos do mês, com login só para o dono, banco **PostgreSQL no Supabase**, gráficos e alertas que se atualizam em tempo real. Funciona no notebook e no celular.

O visual é o mesmo da tela de login: vidro com blur sobre a madeira.

## O que ele faz

- **Login privado** (Supabase Auth) — sem cadastro público.
- **Lançamentos do dia a dia**: gastos e receitas, categorias, data, marcação de conta fixa.
- **Alertas** no topo da tela e avisos quando o status muda:
  - 🔴 **Vermelho**: passou do orçamento do mês ou o ritmo está mais de 10% acima do esperado.
  - 🟢 **Bom**: ritmo entre 90% e 110% do esperado.
  - 🏆 **Ótimo**: ritmo até 90% do esperado.
- **Quanto posso gastar hoje**, calculado com o que sobra do orçamento variável.
- **Estímulo**: sequência de dias dentro do limite, níveis, meta de economia e frase do dia.
- **Próximos meses**: previsão pela média, quanto sobra em 3/6/12 meses e dicas (regra 50/30/20, onde cortar 10%).
- **Gráficos**: gastos por categoria, acumulado × ritmo ideal, gasto de cada dia, últimos 6 meses + previsão.
- **Tempo real**: lançou no celular, o notebook atualiza sozinho.

### Como o ritmo é calculado

```
orçamento variável = orçamento do mês − contas fixas previstas
ritmo esperado hoje = orçamento variável × (dia atual ÷ dias do mês)
```

Contas fixas (aluguel, internet…) ficam de fora do ritmo diário. Assim, pagar o aluguel no dia 1 não deixa o mês "no vermelho". Marque **Conta fixa** ao lançar esse tipo de gasto.


- "Lembrar-me" desmarcado: a sessão some quando você fecha a aba.
