precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
void main(){
vec2 r=u_resolution,u=(gl_FragCoord.xy*2.-r)/min(r.x,r.y);
float d0=length(u),t=u_time,a,c,s,d;vec3 o=vec3(0.);
for(float i=0.;i<4.;i++){
a=t*.15+i*.5;c=cos(a);s=sin(a);
u=fract(mat2(c,-s,s,c)*u*1.5)-.5;
d=(length(u)+.07*cos(6.*atan(u.y,u.x+1e-5)+t*2.-i))*exp(-d0);
d=pow(.096/(abs(sin(d*8.-t*1.6+i))+.016),1.15);
o+=(.5+.5*cos(6.283*(d0+i*.35-t*.25+vec3(0.,.2,.4))))*d;
}
gl_FragColor=vec4(o/(1.+o),1.);
}