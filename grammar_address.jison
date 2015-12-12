/* description smtp protocol */

/* lexical grammar */
%lex
%options flex
%%

"<"     return 'LC';
">"		return 'RC'
","		return 'COMMA'
"@"		return 'AT'
"."		return 'DOT'
":"     return 'SEP'

(([a-zA-Z0-9]|"-")*[a-zA-Z0-9])					{return 'LOCAL-DOMAIN-COMMON';}
([a-zA-Z0-9]|"-"|"!"|"#"|"$"|"%"|"&"|"'"|"*"|"+"|"/"|"="|"?"|"^"|"_"|"`"|"{"|"|"|"}"|"~")+ {return 'ATOM';}

"\""	return 'QUOTED'

\s+.$	return 'ARGS'

/lex

/* operator associations and precedence */

%start expressions


%% /* language grammar */

expressions
	: main-expressions
		{
			$1.args = '';
			return $1;
		}
	| main-expressions ARGS
		{
			$1.args = $2;
			return $1;
		}
	;

main-expressions
	: LC RC
		{
			$$ = {
				type: 'empty',
				value: "<>"
			};
		}
	| path
		{
			$$ = {
				type: 'path',
				value: $1
			};
		}
	| domain
		{
			$$ = {
				type: 'domain',
				value: $1
			};
		}
	;

path
	: LC a-d-l mailbox RC
		{
			$$ = $3;
		}
	| LC mailbox RC
		{
			$$ = $2;
		}
	;

mailbox
	: local-part AT domain
		{
			$$ = {
				local_part: $1,
				domain: $3,
				type: 'domain'
			};
		}
	;

local-part
	: dot-string
		{
			$$ = $1;
		}
	| quoted-string
	;

dot-string
	: ATOM
		{
			$$ = $1;
		}
	| LOCAL-DOMAIN-COMMON
		{
			$$ = $1;
		}
	| ATOM DOT LOCAL-DOMAIN-COMMON
		{
			$$ = $1 + '.' + $3;
		}
	| LOCAL-DOMAIN-COMMON DOT ATOM
		{
			$$ = $1 + '.' + $3;
		}
	;

a-d-l
	: atdomain a-d-l-r SEP
		{
			$$ = null;
		}
	;
a-d-l-r
	:
		{
			$$ = null;
		}
	| COMMA atdomain a-d-l-r
		{
			$$ = null;
		}
	;

atdomain
	: AT domain
		{
			$$ = '@' + $2;
		}
	;

domain
	: LOCAL-DOMAIN-COMMON sub-domain-recur
		{
			$$ = $1 + $2;
		}
	;

sub-domain-recur
	:
		{
			$$ = '';
		}
	| sub-domain-recur DOT LOCAL-DOMAIN-COMMON
		{
			$$ = $1 + '.' + $3;
		}
	;
