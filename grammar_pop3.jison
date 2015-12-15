/* description smtp protocol */

/* lexical grammar */
%lex
%options flex
%s number args
%%

<INITIAL>\s*(U|u)(S|s)(E|e)(R|r)\s*    {this.begin("args"); return "USER";}
<INITIAL>\s*(P|p)(A|a)(S|s)(S|s)\s     {this.begin("args"); return "PASS";}
<INITIAL>\s*(S|s)(T|t)(A|a)(T|t)\s*    {this.begin("number"); return "STAT";}
<INITIAL>\s*(L|l)(I|i)(S|s)(T|t)\s*    {this.begin("number"); return "LIST";}
<INITIAL>\s*(R|r)(E|e)(T|t)(R|r)\s*    {this.begin("number"); return "RETR";}
<INITIAL>\s*(D|d)(E|e)(L|l)(E|e)\s*    {this.begin("number"); return "DELE";}
<INITIAL>\s*(N|n)(O|o)(O|o)(P|p)       {return "NOOP";}
<INITIAL>\s*(R|r)(S|s)(E|e)(T|t)       {return "RSET";}
<INITIAL>\s*(Q|q)(U|u)(I|i)(T|t)       {return "QUIT";}
<INITIAL>\s*(U|u)(I|i)(D|d)(L|l)\s*    {this.begin("number"); return "UIDL";}
<number>[1-9][0-9]*                    {return "NUMBER";}
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
				arg: $2
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
				cmd: 'STAT',
				arg: 0
			};
		}
	| STAT NUMBER
		{
			$$ = {
				cmd: 'STAT',
				arg: Number($2)
			};
		}
	| LIST
		{
			$$ = {
				cmd: 'LIST',
				arg: 0
			};
		}
	| LIST NUMBER
		{
			$$ = {
				cmd: 'LIST',
				arg: Number($2)
			};
		}
	| RETR NUMBER
		{
			$$ = {
				cmd: 'RETR',
				arg: Number($2)
			};
		}
	| DELE NUMBER
		{
			$$ = {
				cmd: 'DELE',
				arg: Number($2)
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
	| UIDL NUMBER
		{
			$$ = {
				cmd: 'UIDL',
				arg: Number($2)
			};
		}
	;
