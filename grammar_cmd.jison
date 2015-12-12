/* description smtp protocol */

/* lexical grammar */
%lex
%s args
%%

<INITIAL>\s*(H|h)(E|e)(L|l)(O|o)                                    {this.begin("args"); return "HELO";}
<INITIAL>\s*(E|e)(H|h)(L|l)(O|o)                                    {this.begin("args"); return "EHLO";}
<INITIAL>\s*(M|m)(A|a)(I|i)(L|l)\s+(F|f)(R|r)(O|o)(M|m)\s*":"\s*	{this.begin("args"); return 'MAIL';}
<INITIAL>\s*(R|r)(C|c)(P|p)(T|t)\s+(T|t)(O|o)\s*":"\s*                 {this.begin("args"); return 'RCPT';}
<INITIAL>(R|r)(S|s)(E|e)(T|t)                                       {this.begin("args"); return 'RSET';}
<INITIAL>(Q|q)(U|u)(I|i)(T|t)                                       {this.begin("args"); return 'QUIT';}
<INITIAL>(D|d)(A|a)(T|t)(A|a)                                       {this.begin("args"); return 'DATA';}
<args>.*                                                            {return 'ARGS';}

/lex

/* operator associations and precedence */

%start expressions


%% /* language grammar */

expressions
	: cmd ARGS
		{
			$1.args = $2.trim();
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
	| MAIL
		{
			$$ = {
				cmd: 'MAIL',
			};
		}
	| RCPT
		{
			$$ = {
				cmd: 'RCPT',
			};
		}
	| DATA
		{
			$$ = {
				cmd: 'DATA'
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
