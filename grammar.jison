/* description smtp protocol */

/* lexical grammar */
%lex
MAIL			MAIL
%%

\s+				/* skip whitespace */
(H|h)(E|e)(L|l)(O|o)			return "HELO"
(E|e)(H|h)(L|l)(O|o)			return "EHLO"
"MAIL"							return "MAIL"
"FROM"							return 'FROM'
"RCPT"							return 'RCPT'
"TO"							return 'TO'
"RSET"							return 'RSET'
"QUIT"							return 'QUIT'
"DATA"							return 'DATA'
"<"								return 'LC'
">"								return 'RC'
","								return 'COMMA'
"@"								return 'AT'
":"								return 'SEP'

/lex

/* operator associations and precedence */

%start expressions


%% /* language grammar */

expressions
	: cmd
		{
			return $1;
		}
	;

cmd
	: HELO
		{
			$$ = {
				cmd: 'HELO',
				is_ext: 0
			};
		}
	| EHLO
		{
			$$ = {
				cmd: 'HELO',
				is_ext: 1
			};
		}
	| MAIL FROM SEP mail_path
		{
			$$ = {
				cmd: 'MAIL',
				from: $4
			};
		}
	| RSET
		{
			$$ = {
				cmd: "RSET"
			};
		}
	| QUIT
		{
			$$ = {
				cmd: "QUIT"
			};
		}
	;

mail_path
	: empty_box
		{
			$$ = '';
		}
	;

empty_box
	: LC RC
	;

/*
	| reverse_path
	;

reverse_path
	: path
	;

forward_path
	: path
	;

path
	: LC adl mailbox RC
	| LC mailbox RC
	;

adl
	: atdomain COMMA adl
	;

atdomain
	: AT domain
	;

domain
	:

*/
