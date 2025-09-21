import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { loginParams } from '../../../../core/interfaces/auth';

interface DataParticle {
  x: number;
  y: number;
  id: number;
  icon: string;
}

interface SchemaInfo {
  tables: number;
  relations: number;
  fields: number;
}

@Component({
  selector: 'app-auth-signin',
  standalone: false,
  templateUrl: './auth-signin.component.html',
  styleUrl: './auth-signin.component.css'
})
export class AuthSigninComponent implements OnInit, OnDestroy {
  // Propiedades del login
  email: string = '';
  password: string = '';
  rememberMe: boolean = false;
  hidePassword: boolean = true;
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  user?: any = null;

  // Propiedades de la animación UML
  selectedSchema: string = 'ecommerce';
  animationSpeed: number = 3;
  showRelations: boolean = true;
  highlightedTable: string = '';
  dataParticles: DataParticle[] = [];

  // Esquemas de ejemplo
  schemas: { [key: string]: SchemaInfo } = {
    ecommerce: { tables: 3, relations: 2, fields: 11 },
    university: { tables: 3, relations: 2, fields: 12 }
  };

  // Iconos para partículas de datos
  dataIcons = ['storage', 'account_tree', 'table_chart', 'link', 'key', 'data_object'];

  private animationInterval: any;
  private highlightInterval: any;
  private particleInterval: any;

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    this.generateDataParticles();
    this.startTableHighlighting();
    this.startParticleAnimation();
  }

  ngOnDestroy(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
    if (this.highlightInterval) {
      clearInterval(this.highlightInterval);
    }
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
    }
  }

  // Métodos del login
  async onLogin(): Promise<void> {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor completa todos los campos';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      console.log('Iniciar sesión con:', this.email, this.password);
      const credentials: loginParams = { email: this.email, password: this.password };
      
      this.authService.signIn(credentials).subscribe({
        next: (res) => {
          this.successMessage = '¡Inicio de sesión exitoso! Redirigiendo...';
          localStorage.setItem('auth_token', res.data.token);
          const email = this.authService.getUserEmail();
          
          this.user = this.authService.getUserByEmail(email!).subscribe({
            next: (res) => {
              this.router.navigate(['/', res.data.users.id, 'host']);
            }
          });
        },
        error: (err) => {
          this.errorMessage = 'Error al iniciar sesión. Por favor, inténtalo de nuevo.';
          console.error('Error en login:', err);
        }
      });

    } catch (error) {
      this.errorMessage = 'Credenciales inválidas. Por favor, inténtalo de nuevo.';
      console.error('Error en login:', error);
    } finally {
      this.isLoading = false;
    }
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  forgotPassword(event: Event): void {
    event.preventDefault();
    console.log('Recuperar contraseña para:', this.email);
  }

  goToRegister(): void {
    this.router.navigate(['/auth/signup']);
  }

  // Métodos de animación UML
  selectSchema(schema: string): void {
    this.selectedSchema = schema;
    // Reiniciar animaciones al cambiar esquema
    this.stopAnimations();
    setTimeout(() => {
      this.startTableHighlighting();
      this.generateDataParticles();
    }, 100);
  }

  getCurrentSchema(): SchemaInfo {
    return this.schemas[this.selectedSchema] || this.schemas['ecommerce'];
  }

  private generateDataParticles(): void {
    this.dataParticles = [];
    const particleCount = 8;
    
    for (let i = 0; i < particleCount; i++) {
      this.dataParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        icon: this.dataIcons[Math.floor(Math.random() * this.dataIcons.length)]
      });
    }
  }

  private startTableHighlighting(): void {
    const tables = ['users', 'products', 'orders'];
    let currentIndex = 0;

    this.highlightInterval = setInterval(() => {
      this.highlightedTable = tables[currentIndex];
      currentIndex = (currentIndex + 1) % tables.length;
    }, 2000);
  }

  private startParticleAnimation(): void {
    this.particleInterval = setInterval(() => {
      this.generateDataParticles();
    }, 4000);
  }

  private stopAnimations(): void {
    if (this.highlightInterval) {
      clearInterval(this.highlightInterval);
    }
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
    }
    this.highlightedTable = '';
  }
}