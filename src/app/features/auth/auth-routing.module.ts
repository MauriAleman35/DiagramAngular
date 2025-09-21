import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { AuthSigninComponent } from "./pages/auth-signin/auth-signin.component";
import { AuthSignupComponent } from "./pages/auth-signup/auth-signup.component";


const routes: Routes = [
          {path:'',component:AuthSigninComponent},
          {path:'signup',component:AuthSignupComponent}
];
@NgModule({
      imports: [RouterModule.forChild(routes)],
      exports: [RouterModule]
})
export class AuthRoutingModule {}