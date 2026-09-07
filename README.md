# AutoSync

Sistema de gestão de atendimentos para uma oficina de serviços rápidos. A pessoa
cliente solicita um atendimento pela página pública e recebe um código para
acompanhamento; a administração organiza a fila, os serviços e os recursos da
oficina, além de confirmar agendamentos com validação de capacidade.

![Marca AutoSync](AutoSync/frontend/public/assets/brand/autosync-logo.png)

## O que o projeto entrega

- Catálogo público de serviços ativos e formulário de solicitação com validação
  no navegador e na API.
- Criação de pedidos sempre como PENDENTE, confirmação visual e código público
  de acompanhamento.
- Consulta pública por código de acompanhamento.
- Painel protegido por login, com logout, busca por nome ou e-mail, filtro por
  status, paginação e feedback para cada ação.
- Gestão de serviços, boxes e funcionários, com desativação lógica para
  preservar o histórico.
- Sugestão da primeira vaga disponível e confirmação manual de uma combinação
  válida de box, funcionário e intervalo.
- Controle separado do andamento operacional: AGENDADO, EM_ANDAMENTO,
  ATRASADO e CONCLUÍDO.

O diferencial do AutoSync é a sugestão de capacidade: em dias úteis, entre
08:00 e 18:00, a API encontra o primeiro intervalo futuro em que um box e um
funcionário ativos permanecem livres durante toda a duração estimada do
serviço. A decisão final continua sendo da administração.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Interface | React, TypeScript e Vite |
| API | Python e FastAPI |
| Dados | MySQL, SQLAlchemy e Alembic |
| Autenticação | JWT para o administrador de demonstração |
| Ambiente local | Docker Compose |
| Testes | Pytest e Vitest |

As decisões, trade-offs, limites de escopo e uso de IA estão em
[DECISOES.md](DECISOES.md).

## Pré-requisitos

- Docker Desktop com Docker Compose v2.
- Portas 3306, 5173 e 8000 disponíveis.

Para executar os testes sem Docker, também são necessários Python 3.12+ e
Node.js com Corepack/pnpm. O fluxo recomendado abaixo usa containers.

## Subindo o ambiente

Todos os comandos desta seção partem da raiz deste repositório.

~~~bash
cd AutoSync
cp .env.example .env
docker compose up --build
~~~

No PowerShell, copie o arquivo de exemplo com:

~~~powershell
Copy-Item .env.example .env
~~~

Antes de subir o ambiente, edite o arquivo AutoSync/.env e substitua os valores
de exemplo, sobretudo MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD e JWT_SECRET_KEY.
Esses valores são exclusivamente locais: não versione o arquivo .env nem use
segredos reais de outros ambientes.

Na primeira inicialização, o serviço da API executa as migrations do Alembic e
o seed automaticamente. Depois, acesse:

| Serviço | Endereço |
| --- | --- |
| Interface | http://localhost:5173 |
| Documentação interativa da API | http://localhost:8000/docs |
| API | http://localhost:8000 |

Para encerrar preservando os dados locais:

~~~bash
docker compose down
~~~

Para recomeçar a demonstração com um banco vazio, remova também o volume. Este
comando apaga os dados locais do MySQL:

~~~bash
docker compose down --volumes
~~~

## Dados de demonstração

O seed cria quatro serviços ativos, dois boxes ativos, três funcionários, um
pedido pendente e um atendimento confirmado/agendado. Ele também cria uma
conta apenas para demonstração local:

| Campo | Valor |
| --- | --- |
| E-mail | admin@autosync.example.com |
| Senha | autosync-demo |

Essas não são credenciais reais. Em qualquer ambiente compartilhado ou de
produção, substitua o segredo JWT e crie uma conta administrativa própria.

Os códigos públicos de demonstração são ATS-0B0B0001 (pedido pendente) e
ATS-A11CE001 (atendimento agendado).

## Executando os testes

Com o ambiente de containers disponível, em AutoSync execute:

~~~bash
# API: instala as dependências exclusivas de desenvolvimento no container efêmero
docker compose run --rm api sh -c "pip install -r requirements-dev.txt && pytest"

# Interface
docker compose run --rm frontend pnpm test
docker compose run --rm frontend pnpm typecheck
docker compose run --rm frontend pnpm build
~~~

Os testes de API cobrem, entre outros cenários, a criação válida e inválida de
pedidos, autenticação e proteção das rotas administrativas, persistência das
mudanças de status, gestão de recursos, sugestão de vagas, conflitos de agenda
e atraso operacional. Os testes da interface exercitam os fluxos públicos e
administrativos mais importantes.

## Fluxo para avaliação

1. Suba o ambiente pelo Docker Compose.
2. Abra a interface e envie uma solicitação de atendimento válida.
3. Guarde o código exibido na confirmação e consulte o pedido pela página
   pública.
4. Entre no painel com a conta de demonstração.
5. Pesquise ou filtre pedidos, confirme ou cancele um registro e confira o
   feedback imediato.
6. Cadastre, edite ou desative um serviço, box ou funcionário.
7. Para um pedido pendente, consulte a sugestão de vaga ou escolha um intervalo
   manual válido; a API rejeita conflitos de capacidade.

## Estrutura do repositório

~~~text
.
├── AutoSync/
│   ├── backend/        # API FastAPI, migrations, seed e testes Pytest
│   ├── frontend/       # Interface React/Vite e testes Vitest
│   ├── .env.example    # configuração local de exemplo
│   └── docker-compose.yml
├── README.md
└── DECISOES.md
~~~

## Limites intencionais

O projeto não inclui pagamentos, notificações, contas de clientes,
especialidades por funcionário, atendimento aguardando peças, reagendamento
automático em cascata ou exclusão física de registros. Esses recortes mantêm o
foco no núcleo demonstrável do desafio e estão justificados em
[DECISOES.md](DECISOES.md).
