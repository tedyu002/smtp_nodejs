/* description smtp protocol */

/* lexical grammar */
%lex
%options flex
%s number args
%%

<INITIAL>\s*(U|u)(S|s)(E|e)(R|r)\s*    {this.begin("args"); return "USER";}
<INITIAL>\s*(P|p)(A|a)(S|s)(S|s)\s     {this.begin("args"); return "PASS";}
<INITIAL>\s*(S|s)(T|t)(A|a)(T|t)\s*$   {return "STAT";}
<INITIAL>\s*(L|l)(I|i)(S|s)(T|t)       {this.begin("number"); return "LIST";}
<INITIAL>\s*(R|r)(E|e)(T|t)(R|r)       {this.begin("number"); return "RETR";}
<INITIAL>\s*(D|d)(E|e)(L|l)(E|e)       {this.begin("number"); return "DELE";}
<INITIAL>\s*(N|n)(O|o)(O|o)(P|p)\s*$   {return "NOOP";}
<INITIAL>\s*(R|r)(S|s)(E|e)(T|t)\s*$   {return "RSET";}
<INITIAL>\s*(Q|q)(U|u)(I|i)(T|t)\s*$   {return "QUIT";}
<INITIAL>\s*(U|u)(I|i)(D|d)(L|l)       {this.begin("number"); return "UIDL";}
<number>\s+                            {return "SP";}
<number>[1-9][0-9]*\s*$                {return "NUMBER";}
<number>.                              {return "ERROR";}
<args>.*                               {return "ARGS";}

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
	: USER ARGS
		{
			$$ = {
				cmd: 'USER',
				arg: $2.trim()
			};
		}
	| PASS ARGS
		{
			$$ = {
				cmd: 'PASS',
				arg: $2
			};
		}
	| STAT
		{
			$$ = {
				cmd: 'STAT'
			};
		}
	| LIST
		{
			$$ = {
				cmd: 'LIST'
			};
		}
	| LIST SP NUMBER
		{
			$$ = {
				cmd: 'LISTN',
				arg: Number($3)
			};
		}
	| RETR SP NUMBER
		{
			$$ = {
				cmd: 'RETR',
				arg: Number($3)
			};
		}
	| DELE SP NUMBER
		{
			$$ = {
				cmd: 'DELE',
				arg: Number($3)
			};
		}
	| NOOP
		{
			$$ = {
				cmd: 'NOOP'
			};
		}
	| RSET
		{
			$$ = {
				cmd: 'RSET'
			};
		}
	| QUIT
		{
			$$ = {
				cmd: 'QUIT'
			};
		}
	| UIDL
		{
			$$ = {
				cmd: 'UIDL',
				arg: 0
			};
		}
	| UIDL SP NUMBER
		{
			$$ = {
				cmd: 'UIDLN',
				arg: Number($3)
			};
		}
	;
